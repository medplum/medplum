// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from 'vitest';
import { installationInput } from './install-input';
const credentials = { GOOGLE_CALENDAR_CLIENT_ID: 'test-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'test-secret' };

test('installation forwards only declared inputs and preserves an omitted project ceiling', () => {
  expect(installationInput({ ...credentials, UNRELATED_SECRET: 'must-not-be-forwarded' })).toEqual({
    resourceType: 'Parameters',
    parameter: [
      { name: 'GOOGLE_CALENDAR_CLIENT_ID', valueString: 'test-client' },
      { name: 'GOOGLE_CALENDAR_CLIENT_SECRET', valueString: 'test-secret' },
    ],
  });
});
test('missing secrets and invalid privacy levels fail before a request', () => {
  expect(() => installationInput({ GOOGLE_CALENDAR_CLIENT_ID: 'test-client' })).toThrow(
    'Missing GOOGLE_CALENDAR_CLIENT_SECRET'
  );
  expect(() => installationInput({ ...credentials, GOOGLE_CALENDAR_DETAIL_LEVEL: 'full-with-invite' })).toThrow(
    'Invalid GOOGLE_CALENDAR_DETAIL_LEVEL'
  );
});
test('explicit detail level and application link are included', () => {
  const input = installationInput({
    ...credentials,
    GOOGLE_CALENDAR_DETAIL_LEVEL: 'initials',
    GOOGLE_CALENDAR_APPOINTMENT_URL: 'https://example.com/appointments/{id}',
  });
  expect(input.parameter).toContainEqual({ name: 'GOOGLE_CALENDAR_DETAIL_LEVEL', valueString: 'initials' });
  expect(input.parameter).toContainEqual({
    name: 'GOOGLE_CALENDAR_APPOINTMENT_URL',
    valueString: 'https://example.com/appointments/{id}',
  });
});
