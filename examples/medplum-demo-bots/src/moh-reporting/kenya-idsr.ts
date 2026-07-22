// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type {
  AccessPolicy,
  CodeSystem,
  CodeableConcept,
  Coding,
  Observation,
  Subscription,
  ValueSet,
} from '@medplum/fhirtypes';

export const KENYA_IDSR_CODE_SYSTEM_URL = 'https://moh.health.go.ke/fhir/CodeSystem/kenya-idsr-immediate';
export const KENYA_IDSR_VALUE_SET_URL = 'https://moh.health.go.ke/fhir/ValueSet/kenya-idsr-immediate';
export const KENYA_IDSR_IDENTIFIER_SYSTEM = 'https://moh.health.go.ke/fhir/NamingSystem/idsr-reporting';
export const KENYA_IDSR_TASK_CODE_SYSTEM = 'https://moh.health.go.ke/fhir/CodeSystem/idsr-task-code';
export const KENYA_IDSR_REVIEW_TASK_CODE = 'idsr-case-review';

export const KENYA_IDSR_IMMEDIATE_CONDITIONS: Coding[] = [
  { system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'CHOLERA', display: 'Cholera' },
  { system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'MEASLES', display: 'Measles' },
  { system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'VHF', display: 'Viral haemorrhagic fever' },
  { system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'AFP-POLIO', display: 'Acute flaccid paralysis / poliomyelitis' },
  { system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'ANTHRAX', display: 'Anthrax' },
  { system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'PLAGUE', display: 'Plague' },
  { system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'MENINGITIS', display: 'Meningococcal meningitis' },
  { system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'RABIES', display: 'Human rabies' },
  { system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'COVID-19', display: 'COVID-19' },
  { system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'YELLOW-FEVER', display: 'Yellow fever' },
  { system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'NEONATAL-TETANUS', display: 'Neonatal tetanus' },
];

export function createKenyaIdsrCodeSystem(): CodeSystem {
  return {
    resourceType: 'CodeSystem',
    url: KENYA_IDSR_CODE_SYSTEM_URL,
    name: 'KenyaIdsrImmediateReportableConditions',
    title: 'Kenya IDSR Immediately Reportable Conditions',
    status: 'active',
    content: 'complete',
    concept: KENYA_IDSR_IMMEDIATE_CONDITIONS.map((coding) => ({
      code: coding.code as string,
      display: coding.display,
    })),
  };
}

export function createKenyaIdsrValueSet(): ValueSet {
  return {
    resourceType: 'ValueSet',
    url: KENYA_IDSR_VALUE_SET_URL,
    name: 'KenyaIdsrImmediateReportableValueSet',
    title: 'Kenya IDSR Immediately Reportable Conditions',
    status: 'active',
    compose: {
      include: [
        {
          system: KENYA_IDSR_CODE_SYSTEM_URL,
          concept: KENYA_IDSR_IMMEDIATE_CONDITIONS.map((coding) => ({
            code: coding.code as string,
            display: coding.display,
          })),
        },
      ],
    },
  };
}

export function createKenyaIdsrAccessPolicy(): AccessPolicy {
  return {
    resourceType: 'AccessPolicy',
    name: 'Kenya MOH IDSR Reporting Bot Policy',
    resource: [
      ...['Patient', 'Observation', 'DiagnosticReport', 'ServiceRequest', 'Specimen', 'ValueSet'].map(
        (resourceType) => ({
          resourceType,
          interaction: ['read', 'search'] as ('read' | 'search')[],
        })
      ),
      ...['GuidanceResponse', 'Task', 'Communication'].map((resourceType) => ({
        resourceType,
        interaction: ['create', 'read', 'search'] as ('create' | 'read' | 'search')[],
      })),
    ],
  };
}

export function createReportabilityCheckSubscription(botId: string): Subscription {
  return {
    resourceType: 'Subscription',
    status: 'active',
    reason: 'Trigger Kenya MOH IDSR reportability review when lab reports are finalized',
    criteria: 'DiagnosticReport?status=final',
    channel: {
      type: 'rest-hook',
      endpoint: `Bot/${botId}/$execute`,
      payload: 'application/fhir+json',
    },
  };
}

export function createIdsrOruSenderSubscription(botId: string): Subscription {
  return {
    resourceType: 'Subscription',
    status: 'active',
    reason: 'Transmit Kenya MOH IDSR ORU after surveillance review is completed',
    criteria: `Task?status=completed&code=${KENYA_IDSR_REVIEW_TASK_CODE}`,
    channel: {
      type: 'rest-hook',
      endpoint: `Bot/${botId}/$execute`,
      payload: 'application/fhir+json',
    },
  };
}

export async function getReportableConditionCodings(medplum: MedplumClient): Promise<Coding[]> {
  const valueSet = await medplum.searchOne('ValueSet', { url: KENYA_IDSR_VALUE_SET_URL }).catch(() => undefined);
  const codings = valueSet?.compose?.include?.flatMap((include) => {
    return (include.concept ?? []).map((concept) => ({
      system: include.system,
      code: concept.code,
      display: concept.display,
    }));
  });
  return codings?.length ? codings : KENYA_IDSR_IMMEDIATE_CONDITIONS;
}

export function findReportableCoding(observation: Observation, reportableCodings: Coding[]): Coding | undefined {
  return (
    findMatchingCoding(observation.code, reportableCodings) ??
    findMatchingCoding(observation.valueCodeableConcept, reportableCodings)
  );
}

export function findMatchingCoding(
  concept: CodeableConcept | undefined,
  reportableCodings: Coding[]
): Coding | undefined {
  return concept?.coding?.find((coding) => {
    return reportableCodings.some((reportableCoding) => {
      return reportableCoding.system === coding.system && reportableCoding.code === coding.code;
    });
  });
}

export function getIdsrReviewTaskIdentifier(reportId: string): string {
  return `idsr-review-${reportId}`;
}

export function getIdsrGuidanceIdentifier(reportId: string): string {
  return `idsr-guidance-${reportId}`;
}

export function getIdsrCommunicationIdentifier(taskId: string): string {
  return `idsr-communication-${taskId}`;
}
