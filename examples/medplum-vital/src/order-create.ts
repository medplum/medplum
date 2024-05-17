import { BotEvent, MedplumClient } from '@medplum/core';
import { Resource, ServiceRequest, Bundle, Reference, ResourceType, QuestionnaireResponse } from '@medplum/fhirtypes';

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

  const aoes = await get_aoe_resources(medplum, sr.supportingInfo || []);

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
      ...aoes.map((questionaryResponse) => ({
        resource: questionaryResponse,
      })),
    ],
  };

  const resp = await fetch(CREATE_ORDER_URL.toString(), {
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

  // return true;
  // Return the response as a string for debugging purposes
  console.log(JSON.stringify(await resp.json()));
  return JSON.stringify(bundle);
}

function get_id_from_reference(reference: string): [ResourceType, string] {
  // Check if the reference is a valid format (e.g., "Patient/123") using regex
  if (!reference.includes('/')) {
    throw new Error('Invalid reference: ' + reference);
  }

  const parts = reference.split('/');

  if (parts.length !== 2) {
    throw new Error('Invalid reference: ' + reference);
  }

  return [parts[0] as ResourceType, parts[1]];
}

async function get_aoe_resources(medplum: MedplumClient, suporrtedInfo: Reference[]): Promise<QuestionnaireResponse[]> {
  const aoe_ids = suporrtedInfo.reduce<string[]>((acc, curr) => {
    if (!curr.reference) {
      throw new Error('Reference is missing');
    }

    try {
      const [resourceType, id] = get_id_from_reference(curr.reference);

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
