import { BotEvent, MedplumClient } from '@medplum/core';
import { Resource, ServiceRequest, Bundle, Reference, ResourceType, QuestionnaireResponse, Coverage } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Check if event.input is of type Resource
  if (typeof event.input !== 'object' || !('resourceType' in event.input)) {
    return false;
  }

  const resource = event.input as Resource;

  switch (resource.resourceType) {
    case 'ServiceRequest':
      return createVitalOrder(medplum, event, resource as ServiceRequest);
    default:
      return false;
  }
}

async function createVitalOrder(medplum: MedplumClient, event: BotEvent, sr: ServiceRequest): Promise<any> {
  const VITAL_API_KEY = event.secrets['VITAL_API_KEY'].valueString;
  const VITAL_BASE_URL = event.secrets['VITAL_BASE_URL'].valueString || 'https://api.dev.tryvital.io';

  if (!VITAL_API_KEY || !VITAL_BASE_URL) {
    throw new Error('VITAL_API_KEY and VITAL_BASE_URL are required');
  }

  const CREATE_ORDER_URL = VITAL_BASE_URL + '/v3/order';

  const patientID = sr.subject?.reference?.split('/')[1];
  const practitionerID = sr.requester?.reference?.split('/')[1];

  if (!patientID || !practitionerID) {
    throw new Error('ServiceRequest is missing subject or requester');
  }

  const patient = await medplum.readResource('Patient', patientID);
  const practitioner = await medplum.readResource('Practitioner', practitionerID);

  const aoes = await GetAoeResources(medplum, sr.supportingInfo || []);

  const insurance = sr.insurance as Reference<Coverage> | undefined;

  const [resource, coverageID] = GetIDAndResourceFromReference(insurance?.reference || '')
  if (!coverageID || resource !== 'Coverage') {
    throw new Error('Coverage is missing');
  }

  const coverage = await medplum.readResource('Coverage', coverageID);

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          identifier: patient.identifier,
          name: patient.name,
          telecom: patient.telecom,
          gender: patient.gender,
          birthDate: patient.birthDate,
          address: patient.address,
        },
      },
      {
        resource: {
          resourceType: 'Practitioner',
          identifier: practitioner.identifier,
          name: practitioner.name,
          telecom: practitioner.telecom,
          qualification: practitioner.qualification,
        },
      },
      {
        resource: {
          resourceType: 'ServiceRequest',
          identifier: sr.identifier,
          status: sr.status,
          intent: sr.intent,
          priority: sr.priority,
          subject: sr.subject,
          requester: sr.requester,
        },
      },
      {
        resource: coverage,
      },
      ...aoes.map((questionnaryResponse) => ({
        resource: {
          questionaryResponse: questionnaryResponse,
          resourceType: questionnaryResponse.resourceType,
          questionnaire: questionnaryResponse.questionnaire,
          status: questionnaryResponse.status,
          item: questionnaryResponse.item,
        },
      })),
    ],
  };

  const resp = await fetch(CREATE_ORDER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/fhir+json',
      'x-vital-api-key': VITAL_API_KEY,
    },
    body: JSON.stringify(bundle),
  });

  // Not a 2xx response
  if (resp.status - 200 >= 100) {
    throw new Error('Vital API error: ' + (await resp.text()));
  }

  return true;
}

function GetIDAndResourceFromReference(reference: string): [ResourceType, string] {
  if (!reference.includes('/')) {
    throw new Error('Invalid reference: ' + reference);
  }

  const parts = reference.split('/');

  if (parts.length !== 2) {
    throw new Error('Invalid reference: ' + reference);
  }

  return [parts[0] as ResourceType, parts[1]];
}

async function GetAoeResources(medplum: MedplumClient, suporrtedInfo: Reference[]): Promise<QuestionnaireResponse[]> {
  const aoe_ids = suporrtedInfo.reduce<string[]>((acc, curr) => {
    if (!curr.reference) {
      throw new Error('Reference is missing');
    }

    try {
      const [resourceType, id] = GetIDAndResourceFromReference(curr.reference);

      if (resourceType === 'QuestionnaireResponse') {
        return [...acc, id];
      }
    } catch (err) {
      console.error(err);
    }

    return acc;
  }, []);

  return Promise.all(aoe_ids.map(async (id) => medplum.readResource('QuestionnaireResponse', id)));
}
