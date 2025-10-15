// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './welcome-patient';

const medplum = new MockClient();

test('Welcome Patient', async () => {
  const patient: Patient = await medplum.createResource({
    resourceType: 'Patient',
    name: [
      {
        given: ['Marge'],
        family: 'Simpson',
      },
    ],
  });

  const welcomeMessage = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: patient,
    secrets: {},
    contentType: 'text/plain',
  });
  expect(welcomeMessage).toBeDefined();
  expect(welcomeMessage).toStrictEqual('Welcome Marge Simpson');
});
