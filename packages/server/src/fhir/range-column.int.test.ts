// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { parseDateTimeToRange } from './range-column';

// Sets process.env.TZ, which only takes effect in a forked process, so it lives in its own file
describe('range-column timezone', () => {
  test.each([
    ['2025-11-02T09:11:52Z', '2025-11-02T09:11:53.000Z'],
    ['2025-11-02T09:11:52.039Z', '2025-11-02T09:11:52.040Z'],
  ])('date time range uses UTC precision around DST fallback: %s', (value, expectedEnd) => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const range = parseDateTimeToRange(value);
    expect(range.left?.toISOString()).toStrictEqual(new Date(value).toISOString());
    expect(range.right?.toISOString()).toStrictEqual(expectedEnd);
  });
});
