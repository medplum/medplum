// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { setHealthcareServiceSchedulingParameterValues } from '../parameterValues';
import {
  buildServiceItems,
  isSameSelection,
  matchesFilter,
  withStoredService,
} from './SchedulingConfigWorkspace.utils';

const configured = setHealthcareServiceSchedulingParameterValues(
  { resourceType: 'HealthcareService', id: 'exam', name: 'Annual exam' } satisfies WithId<HealthcareService>,
  { duration: 30 }
);
const unconfigured: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'draw', name: 'Blood draw' };
const inactive: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'consult',
  name: 'Consult',
  active: false,
};

describe('matchesFilter', () => {
  test('matches a substring regardless of case, and everything when blank', () => {
    expect(matchesFilter('Exam Room A', 'room')).toBe(true);
    expect(matchesFilter('Exam Room A', '  ')).toBe(true);
    expect(matchesFilter('Exam Room A', 'lab')).toBe(false);
  });
});

describe('buildServiceItems', () => {
  test('marks the selection', () => {
    const items = buildServiceItems([configured, unconfigured], { kind: 'service', id: 'exam' }, '', false);

    expect(items).toEqual([
      { id: 'exam', label: 'Annual exam', selected: true, inactive: false },
      { id: 'draw', label: 'Blood draw', selected: false, inactive: false },
    ]);
  });

  test('hides turned-off visit types unless asked to show them', () => {
    expect(buildServiceItems([configured, inactive], undefined, '', false).map((item) => item.id)).toEqual(['exam']);

    const shown = buildServiceItems([configured, inactive], undefined, '', true);
    expect(shown.map((item) => [item.id, item.inactive])).toEqual([
      ['exam', false],
      ['consult', true],
    ]);
  });

  test('lists the selected visit type even when it is turned off', () => {
    const items = buildServiceItems([configured, inactive], { kind: 'service', id: 'consult' }, '', false);

    expect(items.map((item) => [item.id, item.selected, item.inactive])).toEqual([
      ['exam', false, false],
      ['consult', true, true],
    ]);
  });

  test('a visit type being created selects no row', () => {
    const items = buildServiceItems([configured], { kind: 'new-service', key: 1 }, '', false);

    expect(items[0].selected).toBe(false);
  });

  test('the filter narrows the rows', () => {
    const items = buildServiceItems([configured, unconfigured], undefined, 'BLOOD', false);

    expect(items.map((item) => item.id)).toEqual(['draw']);
  });
});

describe('isSameSelection', () => {
  test('matches the same stored visit type, or the same visit type being created', () => {
    expect(isSameSelection({ kind: 'service', id: 'exam' }, { kind: 'service', id: 'exam' })).toBe(true);
    expect(isSameSelection({ kind: 'service', id: 'exam' }, { kind: 'service', id: 'draw' })).toBe(false);
    expect(isSameSelection({ kind: 'new-service', key: 1 }, { kind: 'new-service', key: 1 })).toBe(true);
    expect(isSameSelection({ kind: 'new-service', key: 1 }, { kind: 'new-service', key: 2 })).toBe(false);
    expect(isSameSelection({ kind: 'service', id: 'exam' }, undefined)).toBe(false);
  });
});

describe('withStoredService', () => {
  test('replaces the stored version where it sits', () => {
    const renamed = { ...unconfigured, name: 'Blood draw (fasting)' };

    expect(withStoredService([configured, unconfigured], renamed)).toEqual([configured, renamed]);
  });

  test('puts a new visit type where its name sorts', () => {
    const created: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'b', name: 'Biopsy' };

    expect(withStoredService([configured, unconfigured], created).map((service) => service.id)).toEqual([
      'exam',
      'b',
      'draw',
    ]);
  });

  test('a renamed visit type moves to where its new name sorts', () => {
    const renamed = { ...configured, name: 'Zoster vaccine' };

    expect(withStoredService([configured, unconfigured], renamed).map((service) => service.id)).toEqual([
      'draw',
      'exam',
    ]);
  });
});
