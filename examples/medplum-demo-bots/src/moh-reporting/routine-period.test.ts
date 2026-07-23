// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { getPreviousRoutineReportingPeriod, parseRoutineReportingFrequency } from './routine-period';

describe('Kenya IDSR routine reporting periods', () => {
  test('calculates the previous monthly reporting period', () => {
    expect(getPreviousRoutineReportingPeriod('monthly', new Date('2026-07-22T12:00:00Z'))).toMatchObject({
      frequency: 'monthly',
      period: '202606',
      start: '2026-06-01T00:00:00.000Z',
      end: '2026-07-01T00:00:00.000Z',
    });
  });

  test('calculates the previous quarterly reporting period', () => {
    expect(getPreviousRoutineReportingPeriod('quarterly', new Date('2026-07-22T12:00:00Z'))).toMatchObject({
      frequency: 'quarterly',
      period: '2026Q2',
      start: '2026-04-01T00:00:00.000Z',
      end: '2026-07-01T00:00:00.000Z',
    });
  });

  test('calculates the previous annual reporting period', () => {
    expect(getPreviousRoutineReportingPeriod('annual', new Date('2026-07-22T12:00:00Z'))).toMatchObject({
      frequency: 'annual',
      period: '2025',
      start: '2025-01-01T00:00:00.000Z',
      end: '2026-01-01T00:00:00.000Z',
    });
  });

  test('defaults unknown frequency values to monthly', () => {
    expect(parseRoutineReportingFrequency('bad-value')).toBe('monthly');
  });
});
