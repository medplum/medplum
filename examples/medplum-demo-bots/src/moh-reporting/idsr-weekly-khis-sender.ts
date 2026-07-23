// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Communication, MeasureReport, Task } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import {
  KENYA_IDSR_IDENTIFIER_SYSTEM,
  KENYA_IDSR_TASK_CODE_SYSTEM,
  KENYA_IDSR_WEEKLY_REVIEW_TASK_CODE,
  getIdsrWeeklyCommunicationIdentifier,
} from './kenya-idsr';

export interface Dhis2DataValueSet {
  readonly dataSet: string;
  readonly orgUnit: string;
  readonly period: string;
  readonly dataValues: Dhis2DataValue[];
}

export interface Dhis2DataValue {
  readonly dataElement: string;
  readonly categoryOptionCombo?: string;
  readonly value: string;
  readonly comment?: string;
}

export async function handler(medplum: MedplumClient, event: BotEvent<Task>): Promise<Dhis2DataValueSet | undefined> {
  const task = event.input;
  if (task.resourceType !== 'Task') {
    throw new Error('Unexpected input. Expected Task');
  }
  if (task.status !== 'completed' || !isWeeklyReviewTask(task)) {
    return undefined;
  }
  if (!task.focus?.reference?.startsWith('MeasureReport/')) {
    throw new Error('IDSR weekly review Task must focus on a MeasureReport');
  }

  const communicationIdentifier = getIdsrWeeklyCommunicationIdentifier(task.id ?? task.focus.reference);
  const existingCommunication = await medplum.searchOne('Communication', {
    identifier: `${KENYA_IDSR_IDENTIFIER_SYSTEM}|${communicationIdentifier}`,
  });
  if (existingCommunication) {
    return undefined;
  }

  const measureReport = await medplum.readReference<MeasureReport>(task.focus as { reference: string });
  const payload = createDhis2DataValueSet(measureReport, event.secrets);
  await postDhis2DataValueSet(payload, event.secrets);
  await medplum.createResource<Communication>({
    resourceType: 'Communication',
    identifier: [{ system: KENYA_IDSR_IDENTIFIER_SYSTEM, value: communicationIdentifier }],
    status: 'completed',
    priority: 'urgent',
    basedOn: [createReference(task)],
    partOf: [createReference(measureReport)],
    subject: measureReport.subject,
    sent: new Date().toISOString(),
    medium: [{ text: 'DHIS2 dataValueSets REST API' }],
    payload: [{ contentString: JSON.stringify(payload) }],
  });
  return payload;
}

export function createDhis2DataValueSet(
  measureReport: MeasureReport,
  secrets: BotEvent['secrets'],
  periodOverride?: string
): Dhis2DataValueSet {
  const dataElementMap = JSON.parse(secrets['KHIS_DATA_ELEMENT_MAP']?.valueString ?? '{}') as Record<string, string>;
  const categoryOptionComboMap = JSON.parse(secrets['KHIS_CATEGORY_OPTION_COMBO_MAP']?.valueString ?? '{}') as Record<
    string,
    string
  >;
  const period =
    periodOverride ??
    secrets['KHIS_PERIOD']?.valueString ??
    formatDhis2WeeklyPeriod(measureReport.period.start as string);
  const orgUnit = secrets['KHIS_ORG_UNIT']?.valueString;
  const dataSet = secrets['KHIS_DATA_SET']?.valueString;
  if (!orgUnit || !dataSet) {
    throw new Error('KHIS_ORG_UNIT and KHIS_DATA_SET bot secrets are required for weekly IDSR submission');
  }
  return {
    dataSet,
    orgUnit,
    period,
    dataValues: (measureReport.group ?? []).map((group) => {
      const code = group.code?.coding?.[0]?.code;
      if (!code || !dataElementMap[code]) {
        throw new Error(`Missing KHIS data element mapping for IDSR weekly code: ${code ?? 'unknown'}`);
      }
      return {
        dataElement: dataElementMap[code],
        categoryOptionCombo: categoryOptionComboMap[code],
        value: String(group.population?.[0]?.count ?? 0),
        comment: group.code?.text,
      };
    }),
  };
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
    throw new Error(`KHIS weekly IDSR submission failed: ${response.status} ${response.statusText}`);
  }
}

function isWeeklyReviewTask(task: Task): boolean {
  return !!task.code?.coding?.some((coding) => {
    return coding.system === KENYA_IDSR_TASK_CODE_SYSTEM && coding.code === KENYA_IDSR_WEEKLY_REVIEW_TASK_CODE;
  });
}

function formatDhis2WeeklyPeriod(start: string): string {
  const date = new Date(start);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const weekOneStart = new Date(yearStart);
  const day = weekOneStart.getUTCDay() || 7;
  weekOneStart.setUTCDate(weekOneStart.getUTCDate() - day + 1);
  const week = Math.floor((date.getTime() - weekOneStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${date.getUTCFullYear()}W${week.toString().padStart(2, '0')}`;
}
