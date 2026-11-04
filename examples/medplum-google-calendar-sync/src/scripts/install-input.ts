// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Parameters } from '@medplum/fhirtypes';
import { SECRET } from '../common/constants';

/**
 * The install parameters from the environment. The Google client is optional here: a customer
 * admin normally enters it as project secrets in the Medplum app, and the installer reads those.
 * @param env - Environment variables.
 * @returns The `Parameters` body for `Project/$google-calendar-install`.
 */
export function installationInput(env: Record<string, string | undefined>): Parameters {
  const names = [SECRET.clientId, SECRET.clientSecret, SECRET.allowEventDetails, SECRET.appointmentUrl];
  for (const name of [SECRET.clientId, SECRET.clientSecret]) {
    if (env[name]?.trim().startsWith('YOUR_')) {
      throw new Error(`Replace or remove the .env.example placeholder in ${name}`);
    }
  }
  const allow = env[SECRET.allowEventDetails]?.trim().toLowerCase();
  if (allow && allow !== 'true' && allow !== 'false') {
    throw new Error(`Invalid ${SECRET.allowEventDetails}; use true or false`);
  }
  return {
    resourceType: 'Parameters',
    parameter: names.filter((name) => env[name]?.trim()).map((name) => ({ name, valueString: env[name]?.trim() })),
  };
}
