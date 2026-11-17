// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { getConditionStatusColor } from './conditions';

describe('getConditionStatusColor', () => {
  test.each([
    ['active', 'green'],
    ['recurrence', 'green'],
    ['relapse', 'green'],
    ['inactive', 'orange'],
    ['remission', 'blue'],
    ['resolved', 'teal'],
    ['unknown', 'gray'],
    [undefined, 'gray'],
  ])('maps %s to %s', (status, color) => {
    expect(getConditionStatusColor(status)).toBe(color);
  });
});
