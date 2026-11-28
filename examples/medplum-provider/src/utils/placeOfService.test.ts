// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Encounter } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import {
  applyPlaceOfService,
  PLACE_OF_SERVICE_SYSTEM,
  PLACE_OF_SERVICE_URL,
  withPlaceOfService,
} from './placeOfService';

const other = { url: 'http://example.com/other', valueString: 'kept' };
const encounter: Encounter = {
  resourceType: 'Encounter',
  status: 'finished',
  class: { code: 'AMB' },
  extension: [other],
};

describe('placeOfService', () => {
  test('sets, replaces and clears the place of service, keeping other extensions', () => {
    const set = { ...encounter, extension: withPlaceOfService(encounter, '11') };
    expect(set.extension).toEqual([
      other,
      { url: PLACE_OF_SERVICE_URL, valueCoding: { system: PLACE_OF_SERVICE_SYSTEM, code: '11', display: 'Office' } },
    ]);
    expect(withPlaceOfService(set, '02')).toHaveLength(2);
    expect(withPlaceOfService(set, undefined)).toEqual([other]);
  });

  test('puts the place of service on every claim line, for CMS-1500 Box 24B', () => {
    const items = [{ sequence: 1, productOrService: {} }];
    expect(applyPlaceOfService(items, encounter)).toBe(items);
    expect(
      applyPlaceOfService(items, { ...encounter, extension: withPlaceOfService(encounter, '11') })[0]
    ).toMatchObject({
      locationCodeableConcept: { coding: [{ system: PLACE_OF_SERVICE_SYSTEM, code: '11' }] },
    });
  });
});
