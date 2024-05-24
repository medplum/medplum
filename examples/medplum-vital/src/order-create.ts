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
} from '@medplum/fhirtypes';

/**
 * Handles incoming BotEvent messages and processes ServiceRequest resources.
 *
 * @param medplum - An instance of the Medplum client for interacting with the FHIR server.
 * @param event - The BotEvent containing the incoming message.
 * @returns A Promise that resolves to the response data (if successful) or an error message.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Check if event.input is of type Resource
  if (typeof event.input !== 'object' || !('resourceType' in event.input)) {
    return false;
  }

  const enableTestMode = event.secrets['VITAL_TEST_MODE']?.valueBoolean || false;

  const resource = event.input as Resource;

  switch (resource.resourceType) {
    case 'ServiceRequest': {
      if (enableTestMode) {
        const payload = await buildCreateOrderRequestCompatible(medplum, resource);
        const orderID = await createVitalOrder(event.secrets, JSON.stringify(payload), false);
        await simulateResult(medplum, event.secrets, orderID);
        return true;
      }

      const bundle = await buildVitalOrder(medplum, resource);
      return createVitalOrder(event.secrets, JSON.stringify(bundle));
    }
    default:
      return false;
  }
}

/**
 * Simulates the result of a Vital order by sending a POST request to the Vital API.
 * And then executes a bot to process the result.
 * WARN: This is used for testing purposes only.
 */
async function simulateResult(
  medplum: MedplumClient,
  secrets: Record<string, ProjectSetting>,
  orderID: string
): Promise<void> {
  const apiKey = secrets['VITAL_API_KEY'].valueString;
  const baseURL = secrets['VITAL_BASE_URL']?.valueString || 'https://api.dev.tryvital.io';

  if (!apiKey || !baseURL) {
    throw new Error('VITAL_API_KEY and VITAL_BASE_URL are required');
  }

  await fetch(`${baseURL}/v3/order/${orderID}/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-vital-api-key': apiKey,
    },
  });

  await medplum.executeBot('d686a5d6-8b55-414f-8d15-b230f0319cee', { id: orderID });
}

/**
 * Builds a Bundle containing patient, practitioner, service request, coverage, and questionnaire response resources
 * from the provided ServiceRequest.
 *
 * @param medplum - An instance of the Medplum client for interacting with the FHIR server.
 * @param sr - The ServiceRequest resource to use for building the Bundle.
 * @returns A Promise that resolves to the constructed Bundle.
 */
async function buildVitalOrder(medplum: MedplumClient, sr: ServiceRequest): Promise<Bundle> {
  if (!sr.subject || !sr.requester) {
    throw new Error('ServiceRequest is missing subject or requester');
  }

  if (sr.subject.type !== 'Patient' || sr.requester.type !== 'Practitioner') {
    throw new Error('ServiceRequest subject or requester is not a Patient or Practitioner');
  }

  const coverage = await getCoverage(medplum, sr);
  const questionnaries = await getQuestionnaires(medplum, sr.supportingInfo || []);
  const patient = await medplum.readReference(sr.subject as Reference<Patient>);
  const practitioner = await medplum.readReference(sr.requester as Reference<Practitioner>);

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          extension: patient.extension,
          identifier: patient.identifier,
          name: patient.name,
          telecom: patient.telecom,
          gender: patient.gender,
          birthDate: patient.birthDate,
          address: patient.address?.map((address) => ({
            ...address,
            country: address.country || 'US',
          })),
        },
      },
      {
        resource: {
          resourceType: 'Practitioner',
          extension: practitioner.extension,
          identifier: practitioner.identifier,
          name: practitioner.name,
          telecom: practitioner.telecom,
          qualification: practitioner.qualification,
        },
      },
      {
        resource: {
          resourceType: 'ServiceRequest',
          extension: sr.extension,
          identifier: sr.identifier,
          status: sr.status,
          intent: sr.intent,
          priority: sr.priority,
          subject: sr.subject,
          requester: sr.requester,
        },
      },
      {
        resource: {
          resourceType: 'Coverage',
          extension: coverage.extension,
          network: coverage.network,
          subscriberId: coverage.subscriberId,
          status: coverage.status,
          beneficiary: coverage.beneficiary,
          identifier: coverage.identifier,
          payor: coverage.payor,
          relationship: coverage.relationship,
        },
      },
      ...questionnaries.map((qs) => ({
        resource: {
          resourceType: qs.resourceType,
          extension: qs.extension,
          questionnaire: qs.questionnaire,
          status: qs.status,
          item: qs.item,
        },
      })),
    ],
  };
}

type CreateOrderRequestCompatible = {
  user_id: string;
  lab_test_id: string;
  priority: boolean;
  activate_by?: string;
  patient_details: {
    first_name: string;
    last_name: string;
    dob: string;
    gender: string;
    phone_number: string;
    email: string;
  };
  patient_address: {
    receiver_name: string;
    first_line: string;
    second_line: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone_number: string;
  };
  physician: {
    first_name: string;
    last_name: string;
    npi: string;
    phone_number: string;
    email: string;
  };
  health_insurance: {
    subjective: string;
    assessment_plan: string;
    payor_code: string;
    insurance_id: string;
    responsible_relationship: string;
    // responsible_details?: {};
    diagnosis_codes?: string[];
  };
  aoe_answers: {
    marker_id: number;
    question_id: string;
    answer: string;
  }[];
};

/**
 * Builds a CreateOrderRequestCompatible object from the provided ServiceRequest.
 * This object is compatible with the Vital API for creating a new order in json format.
 */
async function buildCreateOrderRequestCompatible(
  medplum: MedplumClient,
  sr: ServiceRequest
): Promise<CreateOrderRequestCompatible> {
  if (!sr.subject || !sr.requester) {
    throw new Error('ServiceRequest is missing subject or requester');
  }

  if (sr.subject.type !== 'Patient' || sr.requester.type !== 'Practitioner') {
    throw new Error('ServiceRequest subject or requester is not a Patient or Practitioner');
  }

  const coverage = await getCoverage(medplum, sr);
  const questionnaries = await getQuestionnaires(medplum, sr.supportingInfo || []);
  const patient = await medplum.readReference(sr.subject as Reference<Patient>);
  const practitioner = await medplum.readReference(sr.requester as Reference<Practitioner>);

  return {
    user_id: sr.extension?.find((e) => e.url === 'user_id')?.valueString || '',
    lab_test_id: sr.extension?.find((e) => e.url === 'lab_test_id')?.valueString || '',
    priority: sr.priority === 'stat',
    patient_details: {
      first_name: patient.name?.[0].given?.[0] || '',
      last_name: patient.name?.[0].family || '',
      dob: patient.birthDate || '',
      gender: patient.gender || '',
      phone_number: patient.telecom?.find((t) => t.system === 'phone')?.value || '',
      email: patient.telecom?.find((t) => t.system === 'email')?.value || '',
    },
    health_insurance: {
      subjective: coverage.extension?.find((e) => e.url === 'subjective')?.valueString || '',
      assessment_plan: coverage.extension?.find((e) => e.url === 'assessment_plan')?.valueString || '',
      payor_code: coverage.network || '',
      insurance_id: coverage.subscriberId || '',
      responsible_relationship: coverage.relationship?.coding?.[0].code || '',
      diagnosis_codes: coverage.extension?.filter((e) => e.url === 'diagnosis_code')?.map((v) => v.valueString || ''),
    },
    patient_address: {
      receiver_name: patient.name?.[0].text || '',
      first_line: patient.address?.[0].line?.[0] || '',
      second_line: patient.address?.[0].line?.[1] || '',
      city: patient.address?.[0].city || '',
      state: patient.address?.[0].state || '',
      zip: patient.address?.[0].postalCode || '',
      country: patient.address?.[0].country || '',
      phone_number: patient.telecom?.find((t) => t.system === 'phone')?.value || '',
    },
    physician: {
      first_name: practitioner.name?.[0].given?.[0] || '',
      last_name: practitioner.name?.[0].family || '',
      npi: practitioner.identifier?.find((i) => i.system === 'npi')?.value || '',
      phone_number: practitioner.telecom?.find((t) => t.system === 'phone')?.value || '',
      email: practitioner.telecom?.find((t) => t.system === 'email')?.value || '',
    },
    aoe_answers: questionnaries.flatMap((qs) =>
      (qs.item || []).map((item) => ({
        // marker_id: item.extension?.find((e) => e.url === 'marker_id')?.valueInteger || 0,
        marker_id: parseInt(item.linkId.split('-')[1] || '0', 10),
        question_id: item.linkId.split('-')[0] || '',
        answer:
          item.answer?.[0].valueString ||
          item.answer?.[0].valueDecimal?.toString() ||
          item.answer?.[0].valueInteger?.toString() ||
          '',
      }))
    ),
  };
}

/**
 * Sends a POST request to the Vital API to create a vital order using the provided Bundle.
 *
 * @param secrets - An object containing project settings, including `VITAL_API_KEY` and `VITAL_BASE_URL`.
 * @param body - The stringified JSON representation of the object to send to the Vital API.
 * @returns A Promise that resolves to the response data from the Vital API (if successful) or throws an error.
 */
async function createVitalOrder(secrets: Record<string, ProjectSetting>, body: string, isFhir = true): Promise<any> {
  const apiKey = secrets['VITAL_API_KEY'].valueString;
  const baseURL = secrets['VITAL_BASE_URL']?.valueString || 'https://api.dev.tryvital.io';

  if (!apiKey || !baseURL) {
    throw new Error('VITAL_API_KEY and VITAL_BASE_URL are required');
  }

  const url = isFhir ? `${baseURL}/v3/order/fhir` : `${baseURL}/v3/order`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': isFhir ? 'application/fhir+json': 'application/json',
      'x-vital-api-key': apiKey,
    },
    body: body,
  });

  // Not a 2xx response
  if (resp.status - 200 >= 100) {
    throw new Error('Vital API error: ' + await resp.text());
  }

  const { order } = (await resp.json()) as { order: { id: string } };

  return order.id;
}

/**
 * Filters and retrieves QuestionnaireResponse resources from the provided references in the ServiceRequest's supportingInfo.
 *
 * @param medplum - An instance of the Medplum client for interacting with the FHIR server.
 * @param suporrtedInfo - An array of references potentially containing QuestionnaireResponse resources.
 * @returns A Promise that resolves to an array of QuestionnaireResponse resources found in the references.
 */
async function getQuestionnaires(medplum: MedplumClient, suporrtedInfo: Reference[]): Promise<QuestionnaireResponse[]> {
  const questionnaires = [] as QuestionnaireResponse[];

  for (const ref of suporrtedInfo) {
    if (ref.type !== 'QuestionnaireResponse') {
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
  const ref = (sr.insurance || []).find((r) => r.type === 'Coverage');

  if (!ref) {
    throw new Error('Coverage is missing');
  }

  return medplum.readReference(ref as Reference<Coverage>);
}
