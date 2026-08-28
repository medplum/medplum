// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CapabilityStatement } from '@medplum/fhirtypes';
import { beforeAll, describe, expect, test } from 'vitest';
import { loadStructureDefinitions } from '../fhir/structure';
import {
  applyCapabilityStatementOverlay,
  DEFAULT_RESOURCE_INTERACTIONS,
  getCapabilityStatementConfigErrors,
  getResourceInteractions,
  getSystemInteractions,
  isResourceTypeAdvertised,
} from './capabilitystatement';

describe('CapabilityStatement config', () => {
  beforeAll(() => {
    loadStructureDefinitions();
  });

  describe('getCapabilityStatementConfigErrors', () => {
    test('Undefined config', () => {
      expect(getCapabilityStatementConfigErrors(undefined)).toStrictEqual([]);
    });

    test('Empty config', () => {
      expect(getCapabilityStatementConfigErrors({})).toStrictEqual([]);
    });

    test('Valid config', () => {
      expect(
        getCapabilityStatementConfigErrors({
          overlay: { title: 'Acme FHIR API' },
          includeResourceTypes: ['Patient', 'Observation'],
          interactions: { '*': ['read', 'search-type'], Patient: [] },
          systemInteractions: ['batch'],
        })
      ).toStrictEqual([]);
    });

    test('Include and exclude are mutually exclusive', () => {
      expect(
        getCapabilityStatementConfigErrors({
          includeResourceTypes: ['Patient'],
          excludeResourceTypes: ['Observation'],
        })
      ).toStrictEqual([
        'capabilityStatement.includeResourceTypes and capabilityStatement.excludeResourceTypes cannot both be set',
      ]);
    });

    test('Unknown resource type in include list', () => {
      expect(getCapabilityStatementConfigErrors({ includeResourceTypes: ['Patient', 'Patinet'] })).toStrictEqual([
        'capabilityStatement.includeResourceTypes contains unknown resource type(s): Patinet',
      ]);
    });

    test('Unknown resource type in exclude list', () => {
      expect(getCapabilityStatementConfigErrors({ excludeResourceTypes: ['NotAResource'] })).toStrictEqual([
        'capabilityStatement.excludeResourceTypes contains unknown resource type(s): NotAResource',
      ]);
    });

    test('Unknown resource type in interactions', () => {
      expect(getCapabilityStatementConfigErrors({ interactions: { Nope: ['read'] } })).toStrictEqual([
        'capabilityStatement.interactions contains unknown resource type: Nope',
      ]);
    });

    test('Unsupported interaction', () => {
      expect(getCapabilityStatementConfigErrors({ interactions: { Patient: ['read', 'history-type'] } })).toStrictEqual(
        ['capabilityStatement.interactions.Patient contains unsupported interaction(s): history-type']
      );
    });

    test('Unsupported system interaction', () => {
      expect(getCapabilityStatementConfigErrors({ systemInteractions: ['batch', 'search-system'] })).toStrictEqual([
        'capabilityStatement.systemInteractions contains unsupported interaction(s): search-system',
      ]);
    });

    test('Overlay cannot set rest', () => {
      expect(getCapabilityStatementConfigErrors({ overlay: { rest: [] } })).toStrictEqual([
        'capabilityStatement.overlay.rest is not supported; use includeResourceTypes, excludeResourceTypes, or interactions instead',
      ]);
    });

    test('Overlay cannot set resourceType', () => {
      expect(getCapabilityStatementConfigErrors({ overlay: { resourceType: 'Patient' } })).toStrictEqual([
        'capabilityStatement.overlay.resourceType is not supported',
      ]);
    });

    test('Multiple errors', () => {
      expect(
        getCapabilityStatementConfigErrors({
          includeResourceTypes: ['Nope'],
          interactions: { Patient: ['frobnicate'] },
        })
      ).toHaveLength(2);
    });
  });

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

    test('Empty array advertises no interactions', () => {
      expect(getResourceInteractions('Patient', { interactions: { Patient: [] } })).toBeUndefined();
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

  describe('applyCapabilityStatementOverlay', () => {
    const base: CapabilityStatement = {
      resourceType: 'CapabilityStatement',
      status: 'active',
      date: '2026-01-01T00:00:00.000Z',
      kind: 'instance',
      fhirVersion: '4.0.1',
      format: ['json'],
      title: 'Medplum Capability Statement',
      publisher: 'Medplum',
      jurisdiction: [{ coding: [{ code: 'US' }] }],
      rest: [{ mode: 'server' }],
    };

    test('Undefined overlay', () => {
      expect(applyCapabilityStatementOverlay(base, undefined)).toBe(base);
    });

    test('Replaces top level fields', () => {
      const result = applyCapabilityStatementOverlay(base, { title: 'Acme FHIR API', publisher: 'Acme Health' });
      expect(result.title).toStrictEqual('Acme FHIR API');
      expect(result.publisher).toStrictEqual('Acme Health');
    });

    test('Null and undefined are ignored', () => {
      const result = applyCapabilityStatementOverlay(base, { jurisdiction: null, publisher: undefined });
      expect(result.jurisdiction).toStrictEqual(base.jurisdiction);
      expect(result.publisher).toStrictEqual('Medplum');
    });

    test('Ignores rest and resourceType', () => {
      const result = applyCapabilityStatementOverlay(base, { resourceType: 'Patient', rest: [] });
      expect(result.resourceType).toStrictEqual('CapabilityStatement');
      expect(result.rest).toStrictEqual([{ mode: 'server' }]);
    });

    test('Does not mutate the input', () => {
      applyCapabilityStatementOverlay(base, { title: 'Acme FHIR API' });
      expect(base.title).toStrictEqual('Medplum Capability Statement');
    });
  });
});
