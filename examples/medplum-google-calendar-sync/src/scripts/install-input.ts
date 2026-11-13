// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Parameters } from '@medplum/fhirtypes';
import { EVENT_DETAIL_LEVELS, SECRET } from '../common/constants';

export function installationInput(env: Record<string, string | undefined>): Parameters {
  const names = [SECRET.clientId, SECRET.clientSecret, SECRET.detailLevel, SECRET.appointmentUrl];
  for (const name of [SECRET.clientId, SECRET.clientSecret]) {
    if (!env[name]?.trim()) {
      throw new Error(`Missing ${name}`);
    }
  }
  const level = env[SECRET.detailLevel]?.trim();
  if (level && !EVENT_DETAIL_LEVELS.some((allowed) => allowed === level)) {
    throw new Error('Invalid GOOGLE_CALENDAR_DETAIL_LEVEL');
  }
  return {
    resourceType: 'Parameters',
    parameter: names.filter((name) => env[name]?.trim()).map((name) => ({ name, valueString: env[name]?.trim() })),
  };
}
