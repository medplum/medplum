// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RESOURCE_INTERACTIONS,
  getResourceInteractions,
  getSystemInteractions,
  isResourceTypeAdvertised,
} from './capabilitystatement';

describe('CapabilityStatement config', () => {
  describe('isResourceTypeAdvertised', () => {
    test('No config advertises everything', () => {
      expect(isResourceTypeAdvertised('Patient', undefined)).toBe(true);
      expect(isResourceTypeAdvertised('Claim', {})).toBe(true);
    });

    test('Include list', () => {
      const config = { includeResourceTypes: ['Patient', 'Observation'] };
      expect(isResourceTypeAdvertised('Patient', config)).toBe(true);
      expect(isResourceTypeAdvertised('Claim', config)).toBe(false);
    });

    test('Exclude list', () => {
      const config = { excludeResourceTypes: ['Claim'] };
      expect(isResourceTypeAdvertised('Patient', config)).toBe(true);
      expect(isResourceTypeAdvertised('Claim', config)).toBe(false);
    });

    test('Empty lists are ignored', () => {
      expect(isResourceTypeAdvertised('Patient', { includeResourceTypes: [], excludeResourceTypes: [] })).toBe(true);
    });
  });

  describe('getResourceInteractions', () => {
    test('Default interactions', () => {
      expect(getResourceInteractions('Patient', undefined)).toStrictEqual(
        DEFAULT_RESOURCE_INTERACTIONS.map((code) => ({ code }))
      );
    });

    test('Wildcard default', () => {
      expect(getResourceInteractions('Patient', { interactions: { '*': ['read', 'search-type'] } })).toStrictEqual([
        { code: 'read' },
        { code: 'search-type' },
      ]);
    });

    test('Resource type overrides wildcard', () => {
      const config = { interactions: { '*': ['read'], DocumentReference: ['read', 'create'] } };
      expect(getResourceInteractions('Patient', config)).toStrictEqual([{ code: 'read' }]);
      expect(getResourceInteractions('DocumentReference', config)).toStrictEqual([
        { code: 'read' },
        { code: 'create' },
      ]);
    });

    test('Resource types not listed keep the defaults', () => {
      expect(getResourceInteractions('Patient', { interactions: { Observation: ['read'] } })).toStrictEqual(
        DEFAULT_RESOURCE_INTERACTIONS.map((code) => ({ code }))
      );
    });

    test('Advertises no interactions when nothing survives the filter', () => {
      expect(getResourceInteractions('Patient', { interactions: { Patient: [] } })).toBeUndefined();
      expect(getResourceInteractions('Patient', { interactions: { Patient: ['nope'] } })).toBeUndefined();
    });

    test('Output uses canonical ordering', () => {
      expect(getResourceInteractions('Patient', { interactions: { Patient: ['create', 'read'] } })).toStrictEqual([
        { code: 'read' },
        { code: 'create' },
      ]);
    });
  });

  describe('getSystemInteractions', () => {
    test('Default', () => {
      expect(getSystemInteractions(undefined)).toStrictEqual([{ code: 'transaction' }, { code: 'batch' }]);
    });

    test('Restricted', () => {
      expect(getSystemInteractions({ systemInteractions: ['batch'] })).toStrictEqual([{ code: 'batch' }]);
    });

    test('Empty array advertises no system interactions', () => {
      expect(getSystemInteractions({ systemInteractions: [] })).toBeUndefined();
    });
  });
});
