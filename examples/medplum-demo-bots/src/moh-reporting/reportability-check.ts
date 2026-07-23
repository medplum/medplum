// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import { EMPTY, createReference, getReferenceString } from '@medplum/core';
import type { DiagnosticReport, GuidanceResponse, Observation, Task } from '@medplum/fhirtypes';
import {
  KENYA_IDSR_IDENTIFIER_SYSTEM,
  KENYA_IDSR_REVIEW_TASK_CODE,
  KENYA_IDSR_TASK_CODE_SYSTEM,
  KENYA_IDSR_VALUE_SET_URL,
  findReportableCoding,
  getIdsrGuidanceIdentifier,
  getIdsrReviewTaskIdentifier,
  getReportableConditionCodings,
} from './kenya-idsr';

export async function handler(medplum: MedplumClient, event: BotEvent<DiagnosticReport>): Promise<boolean> {
  const report = event.input;
  if (report.resourceType !== 'DiagnosticReport') {
    throw new Error('Unexpected input. Expected DiagnosticReport');
  }

  if (report.status !== 'final') {
    return false;
  }

  if (!report.id) {
    throw new Error('DiagnosticReport must have an id before reportability evaluation');
  }

  const taskIdentifier = getIdsrReviewTaskIdentifier(report.id);
  const existingTask = await medplum.searchOne('Task', {
    identifier: `${KENYA_IDSR_IDENTIFIER_SYSTEM}|${taskIdentifier}`,
  });
  if (existingTask) {
    return true;
  }

  const reportableCodings = await getReportableConditionCodings(medplum);
  const observations = await readReportObservations(medplum, report);
  const matchedObservation = observations.find((observation) => findReportableCoding(observation, reportableCodings));
  if (!matchedObservation) {
    return false;
  }

  const matchedCoding = findReportableCoding(matchedObservation, reportableCodings);
  await medplum.createResource<GuidanceResponse>({
    resourceType: 'GuidanceResponse',
    identifier: [{ system: KENYA_IDSR_IDENTIFIER_SYSTEM, value: getIdsrGuidanceIdentifier(report.id) }],
    moduleUri: KENYA_IDSR_VALUE_SET_URL,
    status: 'data-required',
    subject: report.subject,
    occurrenceDateTime: new Date().toISOString(),
    reasonCode: matchedCoding ? [{ coding: [matchedCoding], text: matchedCoding.display }] : undefined,
    reasonReference: [createReference(report), createReference(matchedObservation)],
    note: [
      {
        text: 'Potential Kenya IDSR immediately reportable condition detected. Facility surveillance review is required before MOH transmission.',
      },
    ],
  });

  await medplum.createResource<Task>({
    resourceType: 'Task',
    identifier: [{ system: KENYA_IDSR_IDENTIFIER_SYSTEM, value: taskIdentifier }],
    code: {
      coding: [{ system: KENYA_IDSR_TASK_CODE_SYSTEM, code: KENYA_IDSR_REVIEW_TASK_CODE, display: 'IDSR case review' }],
      text: 'Review Kenya IDSR immediately reportable case',
    },
    status: 'ready',
    intent: 'order',
    priority: 'stat',
    focus: createReference(report),
    for: report.subject,
    authoredOn: new Date().toISOString(),
    description: `Review ${getReferenceString(report)} for Kenya MOH IDSR immediate reporting.`,
    performerType: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '309343006',
            display: 'Infection control nurse',
          },
        ],
      },
    ],
    input: [
      {
        type: { text: 'Matched reportable observation' },
        valueReference: createReference(matchedObservation),
      },
    ],
  });

  return true;
}

async function readReportObservations(medplum: MedplumClient, report: DiagnosticReport): Promise<Observation[]> {
  const observations: Observation[] = [];
  for (const observationRef of report.result ?? EMPTY) {
    const observation = await medplum.readReference<Observation>(observationRef);
    observations.push(observation);
    for (const memberRef of observation.hasMember ?? EMPTY) {
      observations.push(await medplum.readReference<Observation>(memberRef));
    }
  }
  return observations;
}
