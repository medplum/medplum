// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { getEpiWeek, getPreviousEpiWeek } from './epi-week';

describe('Kenya IDSR epi-week utilities', () => {
  test('uses Monday as the start of an epi week', () => {
    const epiWeek = getEpiWeek(new Date('2026-07-22T12:00:00Z'));

    expect(epiWeek).toMatchObject({
      period: '2026W30',
      start: '2026-07-20T00:00:00.000Z',
      end: '2026-07-27T00:00:00.000Z',
    });
  });

  test('handles ISO week-year rollover', () => {
    const epiWeek = getEpiWeek(new Date('2026-01-01T12:00:00Z'));

    expect(epiWeek).toMatchObject({
      period: '2026W01',
      start: '2025-12-29T00:00:00.000Z',
      end: '2026-01-05T00:00:00.000Z',
    });
  });

  test('returns the completed week before the current week', () => {
    const epiWeek = getPreviousEpiWeek(new Date('2026-07-22T12:00:00Z'));

    expect(epiWeek).toMatchObject({
      period: '2026W29',
      start: '2026-07-13T00:00:00.000Z',
      end: '2026-07-20T00:00:00.000Z',
    });
  });
});
