// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { getSyncAction } from './sync';

describe('getSyncAction', () => {
  test('skips when no rows are available', () => {
    expect(getSyncAction(0)).toBe('skip-empty');
  });

  test('inserts when at least one row is available', () => {
    expect(getSyncAction(1)).toBe('insert');
    expect(getSyncAction(250)).toBe('insert');
    expect(getSyncAction(1000)).toBe('insert');
  });
});
