// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { isDeceased } from './patients';

describe('isDeceased', () => {
  test('reads deceasedBoolean: true or any deceasedDateTime as deceased', () => {
    expect(isDeceased({ resourceType: 'Patient' })).toBe(false);
    expect(isDeceased({ resourceType: 'Patient', deceasedBoolean: false })).toBe(false);
    expect(isDeceased({ resourceType: 'Patient', deceasedBoolean: true })).toBe(true);
    expect(isDeceased({ resourceType: 'Patient', deceasedDateTime: '2026-10-30T15:45:00.000Z' })).toBe(true);
  });
});
