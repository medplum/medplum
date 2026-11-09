// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block runner
import { ClientStorage, MedplumClient, MemoryStorage } from '@medplum/core';
import { deployConfiguration, intakeConfiguration, previewConfiguration } from './intake-configuration';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

const mode = process.argv[2];
if (mode !== 'preview' && mode !== 'apply') {
  throw new Error('Usage: tsx deploy-intake.ts preview|apply');
}

const target = {
  baseUrl: required('MEDPLUM_BASE_URL'),
  projectId: required('MEDPLUM_PROJECT_ID'),
};
const medplum = new MedplumClient({ baseUrl: target.baseUrl, storage: new ClientStorage(new MemoryStorage()) });

try {
  await medplum.startClientLogin(required('MEDPLUM_CLIENT_ID'), required('MEDPLUM_CLIENT_SECRET'));
  console.log('Target:', target);
  if (mode === 'preview') {
    console.table(await previewConfiguration(medplum, target, intakeConfiguration));
  } else {
    console.log(await deployConfiguration(medplum, target, intakeConfiguration));
  }
} finally {
  medplum.clear();
}
// end-block runner
