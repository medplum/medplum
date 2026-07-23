// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type {
  CodeableConcept,
  Coding,
  Condition,
  MeasureReport,
  Observation,
  Organization,
  Task,
} from '@medplum/fhirtypes';
import { getPreviousEpiWeek } from './epi-week';
import {
  KENYA_IDSR_IDENTIFIER_SYSTEM,
  KENYA_IDSR_TASK_CODE_SYSTEM,
  KENYA_IDSR_WEEKLY_MEASURE_URL,
  KENYA_IDSR_WEEKLY_REVIEW_TASK_CODE,
  findMatchingCoding,
  getIdsrWeeklyMeasureReportIdentifier,
  getIdsrWeeklyReviewTaskIdentifier,
  getWeeklyReportableConditionCodings,
} from './kenya-idsr';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<MeasureReport | undefined> {
  const period =
    event.input && typeof event.input === 'object' && 'period' in event.input ? String(event.input.period) : undefined;
  const epiWeek = getPreviousEpiWeek(new Date());
  const reportPeriod = period ?? epiWeek.period;
  const facility = await getReportingFacility(medplum, event);
  const facilityId = facility.id ?? 'project';
  const identifier = getIdsrWeeklyMeasureReportIdentifier(facilityId, reportPeriod);
  const existingReport = await medplum.searchOne('MeasureReport', {
    identifier: `${KENYA_IDSR_IDENTIFIER_SYSTEM}|${identifier}`,
  });
  if (existingReport) {
    return existingReport;
  }

  const reportableCodings = await getWeeklyReportableConditionCodings(medplum);
  const observations = await medplum.searchResources('Observation', { status: 'final', _count: '1000' });
  const conditions = await medplum.searchResources('Condition', { _count: '1000' });
  const groups = reportableCodings.map((coding) => {
    const count = countMatchingResources(coding, observations, conditions, epiWeek.start, epiWeek.end);
    return {
      code: { coding: [coding], text: coding.display },
      population: [{ code: { text: 'weekly-count' }, count }],
    };
  });

  const measureReport = await medplum.createResource<MeasureReport>({
    resourceType: 'MeasureReport',
    identifier: [{ system: KENYA_IDSR_IDENTIFIER_SYSTEM, value: identifier }],
    status: 'complete',
    type: 'summary',
    measure: KENYA_IDSR_WEEKLY_MEASURE_URL,
    subject: createReference(facility),
    reporter: createReference(facility),
    date: new Date().toISOString(),
    period: {
      start: epiWeek.start,
      end: epiWeek.end,
    },
    group: groups,
  });

  const taskIdentifier = getIdsrWeeklyReviewTaskIdentifier(measureReport.id as string);
  await medplum.createResource<Task>({
    resourceType: 'Task',
    identifier: [{ system: KENYA_IDSR_IDENTIFIER_SYSTEM, value: taskIdentifier }],
    status: 'ready',
    intent: 'order',
    priority: 'urgent',
    code: {
      coding: [
        {
          system: KENYA_IDSR_TASK_CODE_SYSTEM,
          code: KENYA_IDSR_WEEKLY_REVIEW_TASK_CODE,
          display: 'IDSR weekly report review',
        },
      ],
      text: 'Review Kenya IDSR weekly aggregate report',
    },
    focus: createReference(measureReport),
    for: createReference(facility),
    authoredOn: new Date().toISOString(),
    description: `Review ${getReferenceString(measureReport)} for Kenya MOH IDSR weekly submission (${reportPeriod}).`,
    input: [
      { type: { text: 'DHIS2 period' }, valueString: reportPeriod },
      { type: { text: 'Zero reporting included' }, valueBoolean: true },
    ],
  });

  return measureReport;
}

function countMatchingResources(
  coding: Coding,
  observations: Observation[],
  conditions: Condition[],
  start: string,
  end: string
): number {
  const observationCount = observations.filter((observation) => {
    return (
      isInPeriod(observation.effectiveDateTime ?? observation.issued, start, end) &&
      (findMatchingCoding(observation.code, [coding]) || findMatchingCoding(observation.valueCodeableConcept, [coding]))
    );
  }).length;
  const conditionCount = conditions.filter((condition) => {
    return (
      isInPeriod(condition.recordedDate ?? condition.onsetDateTime, start, end) && hasCoding(condition.code, coding)
    );
  }).length;
  return observationCount + conditionCount;
}

function hasCoding(concept: CodeableConcept | undefined, coding: Coding): boolean {
  return !!findMatchingCoding(concept, [coding]);
}

function isInPeriod(value: string | undefined, start: string, end: string): boolean {
  if (!value) {
    return false;
  }
  const timestamp = new Date(value).getTime();
  return timestamp >= new Date(start).getTime() && timestamp < new Date(end).getTime();
}

async function getReportingFacility(medplum: MedplumClient, event: BotEvent): Promise<Organization> {
  const facilityId = event.secrets['IDSR_FACILITY_ORGANIZATION_ID']?.valueString;
  if (facilityId) {
    return medplum.readResource('Organization', facilityId);
  }
  const organization = await medplum.searchOne('Organization');
  if (organization) {
    return organization;
  }
  return medplum.createResource<Organization>({
    resourceType: 'Organization',
    name: event.secrets['IDSR_FACILITY_NAME']?.valueString ?? 'IDSR Reporting Facility',
  });
}
