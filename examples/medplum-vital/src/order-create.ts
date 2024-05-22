import { BotEvent, MedplumClient } from '@medplum/core';
import { Resource, ServiceRequest, Bundle, Reference, QuestionnaireResponse, Coverage, Patient, Practitioner, ProjectSetting } from '@medplum/fhirtypes';

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
        resource: {
          resourceType: 'Coverage',
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
          questionaryResponse: qs,
          resourceType: qs.resourceType,
          questionnaire: qs.questionnaire,
          status: qs.status,
          item: qs.item,
        },
      })),
    ],
  };
}

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

async function getCoverage(medplum: MedplumClient, sr: ServiceRequest): Promise<Coverage> {
  const ref = (sr.insurance || []).find((r) => r.type === 'Coverage');

  if (!ref) {
    throw new Error('Coverage is missing');
  }

  return medplum.readReference(ref as Reference<Coverage>);
}
