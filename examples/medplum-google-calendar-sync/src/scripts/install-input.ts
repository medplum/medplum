// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Parameters } from '@medplum/fhirtypes';
import { EVENT_DETAIL_LEVELS, SECRET } from '../common/constants';

/**
 * The install parameters from the environment. The Google client is optional here: a customer
 * admin normally enters it as project secrets in the Medplum app, and the installer reads those.
 * @param env - Environment variables.
 * @returns The `Parameters` body for `Project/$google-calendar-install`.
 */
export function installationInput(env: Record<string, string | undefined>): Parameters {
  const names = [SECRET.clientId, SECRET.clientSecret, SECRET.detailLevel, SECRET.appointmentUrl];
  for (const name of [SECRET.clientId, SECRET.clientSecret]) {
    if (env[name]?.trim().startsWith('YOUR_')) {
      throw new Error(`Replace or remove the .env.example placeholder in ${name}`);
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
