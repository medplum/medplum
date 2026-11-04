// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isValidCronString } from './cron';

describe('isValidCronString', () => {
  test.each([
    '* * * * *',
    '*/20 * * * *',
    '0 */3 * * *',
    '0 0 * * MON-FRI',
    '0 0 1 jan,Jul *',
    '@daily',
    '@weekdays',
    '0 0 L * *',
    '0 0 15L * *',
    '0 0 * * 5L',
    '0 0 * * fri#2',
    '0 0 ? * *',
    '0 0 * * 1-7',
    '5/15 * * * *',
    '0 0 31 2 1',
    '0 0 29,31 2 *',
    'H H(1-3) H/4 H(1-5)/2 *',
    '',
  ])('accepts %j', (cronString) => {
    expect(isValidCronString(cronString)).toBe(true);
  });

  test.each([
    '* * * * * *',
    '0 * * * * *',
    '@secondly',
    ' ',
    'testing',
    '60 * * * *',
    '10-2 * * * *',
    '1-60 * * * *',
    '*/0 * * * *',
    '1/2/3 * * * *',
    '1,,2 * * * *',
    '0 0 0 0 0 0',
    '* * * * * * *',
    '0 0 31 2 *',
    '0 0 * foo *',
    '0 0 * * 0,7',
    '0 0 * * L',
    '0 0 L * L',
    '0 0 100L * *',
    '0 0 * * 5#6',
    '0 0 * * 1,5#2',
    'H(5-1) * * * *',
    'H(70-80) * * * *',
    'H/0 * * * *',
    'H(1-3)/0 * * * *',
    Array.from({ length: 300 }, (_, i) => i % 60).join(',') + ' * * * *',
    'H/1,H/1,H/1,H/1,H/1 * * * *',
    '0'.repeat(1100) + ' * * * *',
  ])('rejects %j', (cronString) => {
    expect(isValidCronString(cronString)).toBe(false);
  });
});
