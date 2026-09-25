// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { parseMonth, toDateString } from './MonthPickerButton.utils';

describe('MonthPickerButton utils', () => {
  test('toDateString', () => {
    expect(toDateString(new Date(2028, 2, 5, 23, 30))).toBe('2028-03-05');
    expect(toDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  test('parseMonth', () => {
    expect(parseMonth('2028-03-01')).toStrictEqual(new Date(2028, 2, 1));
  });
});
