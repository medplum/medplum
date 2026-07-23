// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Communication, MeasureReport, Task } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import { Dhis2DataValueSet, createDhis2DataValueSet } from './idsr-weekly-khis-sender';
import {
  KENYA_IDSR_IDENTIFIER_SYSTEM,
  KENYA_IDSR_ROUTINE_REVIEW_TASK_CODE,
  KENYA_IDSR_TASK_CODE_SYSTEM,
  getIdsrRoutineCommunicationIdentifier,
} from './kenya-idsr';

export async function handler(medplum: MedplumClient, event: BotEvent<Task>): Promise<Dhis2DataValueSet | undefined> {
  const task = event.input;
  if (task.resourceType !== 'Task') {
    throw new Error('Unexpected input. Expected Task');
  }
  if (task.status !== 'completed' || !isRoutineReviewTask(task)) {
    return undefined;
  }
  if (!task.focus?.reference?.startsWith('MeasureReport/')) {
    throw new Error('IDSR routine review Task must focus on a MeasureReport');
  }

  const communicationIdentifier = getIdsrRoutineCommunicationIdentifier(task.id ?? task.focus.reference);
  const existingCommunication = await medplum.searchOne('Communication', {
    identifier: `${KENYA_IDSR_IDENTIFIER_SYSTEM}|${communicationIdentifier}`,
  });
  if (existingCommunication) {
    return undefined;
  }

  const measureReport = await medplum.readReference<MeasureReport>(task.focus as { reference: string });
  const payload = createDhis2DataValueSet(measureReport, event.secrets, getTaskInputString(task, 'DHIS2 period'));
  await postDhis2DataValueSet(payload, event.secrets);
  await medplum.createResource<Communication>({
    resourceType: 'Communication',
    identifier: [{ system: KENYA_IDSR_IDENTIFIER_SYSTEM, value: communicationIdentifier }],
    status: 'completed',
    priority: 'routine',
    basedOn: [createReference(task)],
    partOf: [createReference(measureReport)],
    subject: measureReport.subject,
    sent: new Date().toISOString(),
    medium: [{ text: 'DHIS2 dataValueSets REST API' }],
    payload: [{ contentString: JSON.stringify(payload) }],
  });
  return payload;
}

async function postDhis2DataValueSet(payload: Dhis2DataValueSet, secrets: BotEvent['secrets']): Promise<void> {
  const baseUrl = secrets['KHIS_BASE_URL']?.valueString;
  const username = secrets['KHIS_USERNAME']?.valueString;
  const password = secrets['KHIS_PASSWORD']?.valueString;
  if (!baseUrl || !username || !password) {
    throw new Error('KHIS_BASE_URL, KHIS_USERNAME, and KHIS_PASSWORD bot secrets are required');
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/dataValueSets`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`KHIS routine IDSR submission failed: ${response.status} ${response.statusText}`);
  }
}

function isRoutineReviewTask(task: Task): boolean {
  return !!task.code?.coding?.some((coding) => {
    return coding.system === KENYA_IDSR_TASK_CODE_SYSTEM && coding.code === KENYA_IDSR_ROUTINE_REVIEW_TASK_CODE;
  });
}

function getTaskInputString(task: Task, text: string): string | undefined {
  return task.input?.find((input) => input.type.text === text)?.valueString;
}
