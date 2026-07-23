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
export const KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL = 'https://moh.health.go.ke/fhir/CodeSystem/kenya-idsr-weekly';
export const KENYA_IDSR_WEEKLY_VALUE_SET_URL = 'https://moh.health.go.ke/fhir/ValueSet/kenya-idsr-weekly';
export const KENYA_IDSR_WEEKLY_MEASURE_URL = 'https://moh.health.go.ke/fhir/Measure/kenya-idsr-weekly';
export const KENYA_IDSR_ROUTINE_MEASURE_URL = 'https://moh.health.go.ke/fhir/Measure/kenya-idsr-routine';
export const KENYA_IDSR_IDENTIFIER_SYSTEM = 'https://moh.health.go.ke/fhir/NamingSystem/idsr-reporting';
export const KENYA_IDSR_TASK_CODE_SYSTEM = 'https://moh.health.go.ke/fhir/CodeSystem/idsr-task-code';
export const KENYA_IDSR_REVIEW_TASK_CODE = 'idsr-case-review';
export const KENYA_IDSR_WEEKLY_REVIEW_TASK_CODE = 'idsr-weekly-review';
export const KENYA_IDSR_ROUTINE_REVIEW_TASK_CODE = 'idsr-routine-review';

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

export const KENYA_IDSR_WEEKLY_CONDITIONS: Coding[] = [
  ...KENYA_IDSR_IMMEDIATE_CONDITIONS,
  { system: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL, code: 'MALARIA', display: 'Malaria' },
  { system: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL, code: 'ARI', display: 'Acute respiratory infection' },
  { system: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL, code: 'AWD', display: 'Acute watery diarrhea' },
  { system: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL, code: 'DYSENTERY', display: 'Dysentery' },
  { system: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL, code: 'TYPHOID', display: 'Typhoid fever' },
  { system: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL, code: 'PNEUMONIA', display: 'Pneumonia' },
  { system: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL, code: 'MALNUTRITION', display: 'Severe acute malnutrition' },
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

export function createKenyaIdsrWeeklyCodeSystem(): CodeSystem {
  return {
    resourceType: 'CodeSystem',
    url: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL,
    name: 'KenyaIdsrWeeklyReportableConditions',
    title: 'Kenya IDSR Weekly Reportable Conditions',
    status: 'active',
    content: 'complete',
    concept: KENYA_IDSR_WEEKLY_CONDITIONS.map((coding) => ({
      code: coding.code as string,
      display: coding.display,
    })),
  };
}

export function createKenyaIdsrWeeklyValueSet(): ValueSet {
  return {
    resourceType: 'ValueSet',
    url: KENYA_IDSR_WEEKLY_VALUE_SET_URL,
    name: 'KenyaIdsrWeeklyReportableValueSet',
    title: 'Kenya IDSR Weekly Reportable Conditions',
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
        {
          system: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL,
          concept: KENYA_IDSR_WEEKLY_CONDITIONS.filter(
            (coding) => coding.system === KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL
          ).map((coding) => ({
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
      ...[
        'Patient',
        'Observation',
        'Condition',
        'DiagnosticReport',
        'Encounter',
        'Location',
        'Organization',
        'ServiceRequest',
        'Specimen',
        'ValueSet',
      ].map((resourceType) => ({
        resourceType,
        interaction: ['read', 'search'] as ('read' | 'search')[],
      })),
      ...['GuidanceResponse', 'MeasureReport', 'Task', 'Communication'].map((resourceType) => ({
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

export function createIdsrWeeklyKhisSenderSubscription(botId: string): Subscription {
  return {
    resourceType: 'Subscription',
    status: 'active',
    reason: 'Submit Kenya MOH IDSR weekly aggregate report after surveillance review is completed',
    criteria: `Task?status=completed&code=${KENYA_IDSR_WEEKLY_REVIEW_TASK_CODE}`,
    channel: {
      type: 'rest-hook',
      endpoint: `Bot/${botId}/$execute`,
      payload: 'application/fhir+json',
    },
  };
}

export function createIdsrRoutineKhisSenderSubscription(botId: string): Subscription {
  return {
    resourceType: 'Subscription',
    status: 'active',
    reason: 'Submit Kenya MOH IDSR monthly, quarterly, or annual routine report after review is completed',
    criteria: `Task?status=completed&code=${KENYA_IDSR_ROUTINE_REVIEW_TASK_CODE}`,
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

export async function getWeeklyReportableConditionCodings(medplum: MedplumClient): Promise<Coding[]> {
  const valueSet = await medplum.searchOne('ValueSet', { url: KENYA_IDSR_WEEKLY_VALUE_SET_URL }).catch(() => undefined);
  const codings = valueSet?.compose?.include?.flatMap((include) => {
    return (include.concept ?? []).map((concept) => ({
      system: include.system,
      code: concept.code,
      display: concept.display,
    }));
  });
  return codings?.length ? codings : KENYA_IDSR_WEEKLY_CONDITIONS;
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

export function getIdsrWeeklyMeasureReportIdentifier(facilityId: string, period: string): string {
  return `idsr-weekly-${facilityId}-${period}`;
}

export function getIdsrWeeklyReviewTaskIdentifier(measureReportId: string): string {
  return `idsr-weekly-review-${measureReportId}`;
}

export function getIdsrWeeklyCommunicationIdentifier(taskId: string): string {
  return `idsr-weekly-communication-${taskId}`;
}

export function getIdsrRoutineMeasureReportIdentifier(facilityId: string, frequency: string, period: string): string {
  return `idsr-${frequency}-${facilityId}-${period}`;
}

export function getIdsrRoutineReviewTaskIdentifier(measureReportId: string): string {
  return `idsr-routine-review-${measureReportId}`;
}

export function getIdsrRoutineCommunicationIdentifier(taskId: string): string {
  return `idsr-routine-communication-${taskId}`;
}
