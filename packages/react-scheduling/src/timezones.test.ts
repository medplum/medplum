// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isSupportedTimezone } from './timezones';

describe('isSupportedTimezone', () => {
  test('Accepts an alias and rejects a zone that does not exist', () => {
    expect(isSupportedTimezone('US/Pacific')).toBe(true);
    expect(isSupportedTimezone('Nowhere/Nothing')).toBe(false);
  });
});
