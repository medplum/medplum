import { BotEvent, MedplumClient } from '@medplum/core';
import {
  Resource,
  ServiceRequest,
  Bundle,
  Reference,
  QuestionnaireResponse,
  Coverage,
  Patient,
  Practitioner,
  ProjectSetting,
  Organization,
} from '@medplum/fhirtypes';

/**
 * Handles incoming BotEvent messages and processes ServiceRequest resources.
 *
 * @param medplum - An instance of the Medplum client for interacting with the FHIR server.
 * @param event - The BotEvent containing the incoming message.
 *
 * @returns A Promise that resolves to the response data (if successful) or an error message.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Check if event.input is of type Resource
  if (typeof event.input !== 'object' || !('resourceType' in event.input)) {
    return false;
  }

  const resource = event.input as Resource;

  switch (resource.resourceType) {
    case 'ServiceRequest': {
      const bundle = await buildVitalOrder(medplum, resource);
      const patient = bundle.entry?.find((e) => e.resource?.resourceType === 'Patient')?.resource as
        | Patient
        | undefined;

      if (!patient) {
        throw new Error('Patient is missing');
      }

      await createVitalUser(event.secrets, patient);
      const orderID = await createVitalOrder(event.secrets, bundle);

      await medplum.updateResource<ServiceRequest>({
        ...resource,
        identifier: [
          ...(resource.identifier || []),
          {
            system: 'vital-order-id',
            use: 'secondary',
            value: orderID,
          },
        ],
      });

      return true;
    }
    default:
      return false;
  }
}

/**
 * Bundle containing patient, practitioner, service request, coverage, and questionnaire response resources
 * for creating a Vital order.
 */
type CreateOrderBundle = Bundle<
  QuestionnaireResponse | Organization | Practitioner | ServiceRequest | Coverage | Patient
>;

/**
 * Builds a Bundle containing patient, practitioner, service request, coverage, and questionnaire response resources
 * from the provided ServiceRequest.
 *
 * @param medplum - An instance of the Medplum client for interacting with the FHIR server.
 * @param sr - The ServiceRequest resource to use for building the Bundle.
 * @returns A Promise that resolves to the constructed Bundle.
 */
export async function buildVitalOrder(medplum: MedplumClient, sr: ServiceRequest): Promise<CreateOrderBundle> {
  if (!sr.subject || !sr.requester) {
    throw new Error('ServiceRequest is missing subject or requester');
  }

  const patient = await medplum.readReference(sr.subject as Reference<Patient>);
  const practitioner = await medplum.readReference(sr.requester as Reference<Practitioner>);

  if (patient.resourceType !== 'Patient' || practitioner.resourceType !== 'Practitioner') {
    throw new Error('ServiceRequest subject or requester is not a Patient or Practitioner');
  }

  const coverage = await getCoverage(medplum, sr);
  const questionnaries = await getQuestionnaires(medplum, sr.supportingInfo || []);
  const performer = await getPerformer(medplum, sr);

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      ...questionnaries.map((qs) => ({ resource: resourceWithoutMeta(qs) })),
      { resource: resourceWithoutMeta(practitioner) },
      { resource: resourceWithoutMeta(sr) },
      { resource: resourceWithoutMeta(coverage) },
      { resource: resourceWithoutMeta(performer) },
      {
        resource: {
          ...resourceWithoutMeta(patient),
          address: patient.address?.map((address) => ({
            ...address,
            country: address.country || 'US',
          })),
        },
      },
    ],
  };
}

/**
 * Returns a copy of the provided resource with the meta field removed.
 *
 * @param resource - The resource to remove the meta field from.
 * @returns A copy of the resource without the meta field.
 *
 * @throws An error if the provided resource is undefined.
 */
export function resourceWithoutMeta<T extends Resource>(resource: T): Omit<T, 'meta'> {
  const { meta: _, ...r } = resource;

  return r;
}

/**
 * Sends a POST request to the Vital API to create a vital order using the provided Bundle.
 *
 * @param secrets - An object containing project settings, including `VITAL_API_KEY` and `VITAL_BASE_URL`.
 * @param body - The Bundle containing the resources to create the order with.
 * @returns A Promise that resolves to the ID of the created order.
 */
export async function createVitalOrder(
  secrets: Record<string, ProjectSetting>,
  body: CreateOrderBundle
): Promise<string> {
  const apiKey = secrets['VITAL_API_KEY'].valueString;
  const baseURL = secrets['VITAL_BASE_URL']?.valueString || 'https://api.dev.tryvital.io';

  if (!apiKey || !baseURL) {
    throw new Error('VITAL_API_KEY and VITAL_BASE_URL are required');
  }

  const url = `${baseURL}/v3/order/fhir`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/fhir+json',
      'x-vital-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  switch (resp.status) {
    case 200: {
      const { order } = (await resp.json()) as { order: { id: string } };

      return order.id;
    }
    default:
      throw new Error('Vital API error: ' + (await resp.json()));
  }
}

/**
 * Response from the Vital API when creating a user.
 */
type CreateUserResponse = {
  client_user_id: string;
  user_id: string;
};

/**
 * Sends a POST request to the Vital API to create a vital user using the provided Patient.
 *
 * @param secrets - An object containing project settings, including `VITAL_API_KEY` and `VITAL_BASE_URL`.
 * @param patient - The Patient resource to create the vital user with.
 *
 * @returns A Promise that resolves to the ID of the created vital user.
 */
export async function createVitalUser(secrets: Record<string, ProjectSetting>, patient: Patient): Promise<string> {
  const apiKey = secrets['VITAL_API_KEY'].valueString;
  const baseURL = secrets['VITAL_BASE_URL']?.valueString || 'https://api.dev.tryvital.io';

  if (!apiKey || !baseURL) {
    throw new Error('VITAL_API_KEY and VITAL_BASE_URL are required');
  }

  const url = `${baseURL}/v2/user`;

  const body = {
    client_user_id: patient.id,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-vital-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  switch (resp.status) {
    case 400:
    case 200: {
      const user = (await resp.json()) as CreateUserResponse;

      if (user.client_user_id) {
        return user.user_id;
      }

      throw new Error('Vital API create user error: ' + JSON.stringify(user));
    }
    default:
      throw new Error('Vital API error: ' + (await resp.json()));
  }
}

/**
 * Filters and retrieves QuestionnaireResponse resources from the provided references in the ServiceRequest's supportingInfo.
 *
 * @param medplum - An instance of the Medplum client for interacting with the FHIR server.
 * @param supportingInfo - An array of references potentially containing QuestionnaireResponse resources.
 * @returns A Promise that resolves to an array of QuestionnaireResponse resources found in the references.
 */
async function getQuestionnaires(
  medplum: MedplumClient,
  supportingInfo: Reference[]
): Promise<QuestionnaireResponse[]> {
  const questionnaires = [] as QuestionnaireResponse[];

  for (const ref of supportingInfo) {
    if (ref.type !== 'QuestionnaireResponse' && !ref.reference?.startsWith('QuestionnaireResponse')) {
      continue;
    }

    const q = await medplum.readReference(ref as Reference<QuestionnaireResponse>);
    questionnaires.push(q);
  }

  if (questionnaires.length === 0) {
    throw new Error('Questionnaires are missing');
  }

  return questionnaires;
}

/**
 * Finds the Coverage resource associated with the provided ServiceRequest.
 *
 * @param medplum - An instance of the Medplum client for interacting with the FHIR server.
 * @param sr - The ServiceRequest resource to search for insurance references.
 * @returns A Promise that resolves to the Coverage resource found in the insurance references,
 * or throws an error if no Coverage is found.
 */
async function getCoverage(medplum: MedplumClient, sr: ServiceRequest): Promise<Coverage> {
  const ref = (sr.insurance || []).find((r) => r.type === 'Coverage' || r.reference?.startsWith('Coverage'));

  if (!ref) {
    throw new Error('Coverage is missing');
  }

  return medplum.readReference(ref as Reference<Coverage>);
}

/**
 * Finds the Organization resource associated with the provided ServiceRequest.
 *
 * @param medplum - An instance of the Medplum client for interacting with the FHIR server.
 * @param sr - The ServiceRequest resource to search for performer references.
 * @returns A Promise that resolves to the Organization resource found in the performer references,
 *
 * @throws An error if no Organization is found.
 */
async function getPerformer(medplum: MedplumClient, sr: ServiceRequest): Promise<Organization> {
  if (!sr.performer || sr.performer.length === 0) {
    throw new Error('Performer is missing');
  }

  for (const ref of sr.performer) {
    if (ref.type === 'Organization' || ref.reference?.startsWith('Organization')) {
      const org = await medplum.readReference(ref as Reference<Organization>);

      const isLabTest = org.identifier?.find(
        (i) => i.system === 'https://docs.tryvital.io/api-reference/lab-testing/tests'
      );

      if (isLabTest) {
        return org;
      }
    }
  }

  throw new Error('Performer is missing');
}
