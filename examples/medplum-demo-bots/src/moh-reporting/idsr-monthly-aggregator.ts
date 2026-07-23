// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { MeasureReport } from '@medplum/fhirtypes';
import { aggregateRoutineReport } from './idsr-routine-aggregator';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<MeasureReport | undefined> {
  return aggregateRoutineReport(medplum, event, 'monthly');
}
