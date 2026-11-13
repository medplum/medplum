// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MedplumClient } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { assertDeploymentProject, cliAccessToken } from './deployment-auth';
import { installationInput } from './install-input';

async function main(): Promise<void> {
  const projectId = process.env.PROJECT_ID;
  if (!projectId) {
    throw new Error('Set PROJECT_ID');
  }
  const input = installationInput(process.env);
  const baseUrl = process.env.BASE_URL ?? process.env.MEDPLUM_BASE_URL ?? 'https://api.medplum.com/';
  const medplum = new MedplumClient({ baseUrl });
  medplum.setAccessToken(cliAccessToken(baseUrl, process.env.MEDPLUM_PROFILE));
  await assertDeploymentProject(medplum, projectId);
  const result = await medplum.post<Parameters>(medplum.fhirUrl('Project', '$google-calendar-install'), input);
  if (
    result.resourceType !== 'Parameters' ||
    !result.parameter?.some((p) => p.name === 'installed' && p.valueBoolean)
  ) {
    throw new Error('Installation did not report success');
  }
  // Print policy instructions and warnings, never the input containing the client secret.
  console.log(JSON.stringify(result, null, 2));
  console.log('Apply the returned policy instructions before connecting practitioners.');
}

main().catch(() => {
  console.error(
    'Installation failed. Check the selected CLI project, required environment variables, and restricted Bot logs. Input secrets were not printed.'
  );
  process.exitCode = 1;
});
