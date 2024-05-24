import { BotEvent, MedplumClient } from '@medplum/core';
import { Resource, ServiceRequest, Bundle, Reference, QuestionnaireResponse, Coverage, Patient, Practitioner, ProjectSetting } from '@medplum/fhirtypes';

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

  const resource = event.input as Resource;

  switch (resource.resourceType) {
    case 'ServiceRequest': {
      const bundle = await buildVitalOrder(medplum, resource);
      return createVitalOrder(event.secrets, bundle);
    }
    default:
      return false;
  }
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
          address: patient.address?.map(address => ({
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

/**
 * Sends a POST request to the Vital API to create a vital order using the provided Bundle.
 *
 * @param secrets - An object containing project settings, including `VITAL_API_KEY` and `VITAL_BASE_URL`.
 * @param bundle - The FHIR Bundle containing patient, practitioner, service request, coverage, and questionnaire response resources.
 * @returns A Promise that resolves to the response data from the Vital API (if successful) or throws an error.
 */
async function createVitalOrder(secrets: Record<string, ProjectSetting>, bundle: Bundle): Promise<any> {
  const apiKey = secrets['VITAL_API_KEY'].valueString;
  const baseURL = secrets['VITAL_BASE_URL']?.valueString || 'https://api.dev.tryvital.io';

  if (!apiKey || !baseURL) {
    throw new Error('VITAL_API_KEY and VITAL_BASE_URL are required');
  }

  const resp = await fetch(`${baseURL}/v3/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/fhir+json',
      'x-vital-api-key': apiKey,
    },
    body: JSON.stringify(bundle),
  });

  const content = await resp.text();

  // Not a 2xx response
  if (resp.status - 200 >= 100) {
    throw new Error('Vital API error: ' + content);
  }

  return content;
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
