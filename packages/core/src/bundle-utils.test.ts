// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';
import { redirectReferences, splitBundleByDependencies } from './bundle-utils';

describe('Bundle utils tests', () => {
  describe('redirectReferences', () => {
    test('Replaces references using redirect map', () => {
      const resource = {
        resourceType: 'Observation',
        subject: { reference: 'Patient/123' },
        performer: [{ reference: 'Practitioner/456' }],
      };

      const redirectMap = new Map([
        ['Patient/123', 'Patient?identifier=http://example.com|MRN-001'],
        ['Practitioner/456', 'Practitioner?identifier=http://npi.org|NPI-001'],
      ]);

      redirectReferences(resource, redirectMap);

      expect(resource.subject.reference).toBe('Patient?identifier=http://example.com|MRN-001');
      expect(resource.performer[0].reference).toBe('Practitioner?identifier=http://npi.org|NPI-001');
    });

    test('Leaves unmatched references unchanged', () => {
      const resource = {
        resourceType: 'Observation',
        subject: { reference: 'Patient/999' },
      };

      const redirectMap = new Map([['Patient/123', 'Patient?identifier=http://example.com|MRN-001']]);

      redirectReferences(resource, redirectMap);

      expect(resource.subject.reference).toBe('Patient/999');
    });
  });

  describe('splitBundleByDependencies', () => {
    test('Splits unrelated resources into separate groups', () => {
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            fullUrl: 'urn:uuid:a',
            resource: { resourceType: 'Condition', id: 'a' } as Resource,
          },
          {
            fullUrl: 'urn:uuid:b',
            resource: { resourceType: 'Condition', id: 'b' } as Resource,
          },
        ],
      };

      const groups = splitBundleByDependencies(bundle);
      expect(groups).toHaveLength(2);
    });

    test('Keeps connected resources together', () => {
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            fullUrl: 'urn:uuid:obs-1',
            resource: { resourceType: 'Observation', id: 'obs-1' } as Resource,
          },
          {
            fullUrl: 'urn:uuid:dr-1',
            resource: {
              resourceType: 'DiagnosticReport',
              id: 'dr-1',
              result: [{ reference: 'urn:uuid:obs-1' }],
            } as unknown as Resource,
          },
        ],
      };

      const groups = splitBundleByDependencies(bundle);
      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(2);
    });

    test('Ignores edges based on predicate', () => {
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            fullUrl: 'urn:uuid:obs-1',
            resource: {
              resourceType: 'Observation',
              id: 'obs-1',
              subject: { reference: 'Patient/pat-1' },
            } as unknown as Resource,
          },
          {
            fullUrl: 'urn:uuid:obs-2',
            resource: {
              resourceType: 'Observation',
              id: 'obs-2',
              subject: { reference: 'Patient/pat-1' },
            } as unknown as Resource,
          },
        ],
      };

      const groups = splitBundleByDependencies(bundle, {
        ignoreReference: (ref) => ref.startsWith('Patient/'),
      });
      // Both reference the same Patient, but Patient edges are ignored
      expect(groups).toHaveLength(2);
    });

    test('Returns empty array for empty bundle', () => {
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [],
      };

      const groups = splitBundleByDependencies(bundle);
      expect(groups).toHaveLength(0);
    });

    test('Groups linked resources together (connected components)', () => {
      const entries: BundleEntry[] = [
        {
          fullUrl: 'urn:uuid:obs-1',
          resource: { resourceType: 'Observation', id: 'obs-1' } as Resource,
        },
        {
          fullUrl: 'urn:uuid:obs-2',
          resource: { resourceType: 'Observation', id: 'obs-2' } as Resource,
        },
        {
          fullUrl: 'urn:uuid:dr-1',
          resource: {
            resourceType: 'DiagnosticReport',
            id: 'dr-1',
            result: [{ reference: 'urn:uuid:obs-1' }, { reference: 'urn:uuid:obs-2' }],
          } as unknown as Resource,
        },
        {
          fullUrl: 'urn:uuid:cond-1',
          resource: { resourceType: 'Condition', id: 'cond-1' } as Resource,
        },
      ];

      const components = splitBundleByDependencies({ resourceType: 'Bundle', type: 'collection', entry: entries });

      // DR + obs-1 + obs-2 should be in one component, Condition in another
      expect(components).toHaveLength(2);

      const drComponent = components.find((c) =>
        c.some((e) => e.resource?.resourceType === 'DiagnosticReport')
      );
      expect(drComponent).toBeDefined();
      expect(drComponent).toHaveLength(3);

      const condComponent = components.find((c) => c.some((e) => e.resource?.resourceType === 'Condition'));
      expect(condComponent).toBeDefined();
      expect(condComponent).toHaveLength(1);
    });

    test('Excludes references to excluded resource types via ignoreReference', () => {
      const entries: BundleEntry[] = [
        {
          fullUrl: 'urn:uuid:obs-1',
          resource: {
            resourceType: 'Observation',
            id: 'obs-1',
            subject: { reference: 'Patient/pat-1' },
          } as unknown as Resource,
        },
        {
          fullUrl: 'urn:uuid:obs-2',
          resource: {
            resourceType: 'Observation',
            id: 'obs-2',
            subject: { reference: 'Patient/pat-1' },
          } as unknown as Resource,
        },
      ];

      const components = splitBundleByDependencies(
        { resourceType: 'Bundle', type: 'collection', entry: entries },
        {
          ignoreReference: (ref) => {
            const [refType] = ref.split('/');
            return refType === 'Patient';
          },
        }
      );

      // Even though both reference the same Patient, Patient is excluded
      // so they should be in separate components
      expect(components).toHaveLength(2);
    });

    test('Finds all reference types in resources', () => {
      // This tests that findAllReferences (internal) works correctly via splitBundleByDependencies
      const entries: BundleEntry[] = [
        {
          fullUrl: 'urn:uuid:abc-def',
          resource: { resourceType: 'ServiceRequest', id: 'abc-def' } as Resource,
        },
        {
          fullUrl: 'urn:uuid:obs-1',
          resource: {
            resourceType: 'Observation',
            id: 'obs-1',
            subject: { reference: 'Patient/123' },
            performer: [{ reference: 'Practitioner/456' }],
            basedOn: [{ reference: 'urn:uuid:abc-def' }],
          } as unknown as Resource,
        },
      ];

      // Without ignoring anything, obs-1 references abc-def so they should be in one component
      const components = splitBundleByDependencies({ resourceType: 'Bundle', type: 'collection', entry: entries });
      expect(components).toHaveLength(1);
      expect(components[0]).toHaveLength(2);
    });
  });
});
