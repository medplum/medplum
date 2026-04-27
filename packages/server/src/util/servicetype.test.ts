// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { CodeableConcept, HealthcareService, Reference } from '@medplum/fhirtypes';
import {
  extractReferencesFromCodeableReferenceLike,
  isCodeableReferenceLikeTo,
  ServiceTypeReferenceURI,
  toCodeableReferenceLike,
} from './servicetype';

describe('toCodeableReferenceLike', () => {
  test('returns a single concept with only the reference extension when service has no type', () => {
    const service: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'svc-1' };
    const result = toCodeableReferenceLike(service);
    expect(result).toHaveLength(1);
    expect(result[0].extension).toHaveLength(1);
    expect(result[0].extension?.[0]).toMatchObject({
      url: ServiceTypeReferenceURI,
      valueReference: { reference: 'HealthcareService/svc-1' },
    });
  });

  test('adds the reference extension to each type entry', () => {
    const service: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      id: 'svc-2',
      type: [{ coding: [{ code: 'checkup' }] }, { coding: [{ code: 'followup' }] }],
    };
    const result = toCodeableReferenceLike(service);
    expect(result).toHaveLength(2);
    for (const concept of result) {
      expect(concept.extension).toContainEqual(
        expect.objectContaining({
          url: ServiceTypeReferenceURI,
          valueReference: { reference: 'HealthcareService/svc-2' },
        })
      );
    }
  });

  test('preserves existing extensions on type entries', () => {
    const service: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      id: 'svc-3',
      type: [
        {
          coding: [{ code: 'checkup' }],
          extension: [{ url: 'http://existing.com', valueString: 'keep-me' }],
        },
      ],
    };
    const result = toCodeableReferenceLike(service);
    expect(result[0].extension).toContainEqual({ url: 'http://existing.com', valueString: 'keep-me' });
    expect(result[0].extension).toContainEqual(expect.objectContaining({ url: ServiceTypeReferenceURI }));
  });
});

describe('isCodeableReferenceLikeTo', () => {
  const service: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'svc-1' };

  test('returns false for undefined serviceType', () => {
    expect(isCodeableReferenceLikeTo(undefined, service)).toBe(false);
  });

  test('returns false for empty serviceType array', () => {
    expect(isCodeableReferenceLikeTo([], service)).toBe(false);
  });

  test('returns true when a concept references the service', () => {
    const serviceType = toCodeableReferenceLike(service);
    expect(isCodeableReferenceLikeTo(serviceType, service)).toBe(true);
  });

  test('returns false when no concept references the service', () => {
    const otherService: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'svc-other' };
    const serviceType = toCodeableReferenceLike(otherService);
    expect(isCodeableReferenceLikeTo(serviceType, service)).toBe(false);
  });

  test('returns false when concepts have no reference extension at all', () => {
    const plainConcepts: CodeableConcept[] = [{ coding: [{ code: 'checkup' }] }];
    expect(isCodeableReferenceLikeTo(plainConcepts, service)).toBe(false);
  });

  test('accepts a Reference object in place of a resource', () => {
    const serviceType = toCodeableReferenceLike(service);
    const ref: Reference<HealthcareService> & { reference: string } = { reference: 'HealthcareService/svc-1' };
    expect(isCodeableReferenceLikeTo(serviceType, ref)).toBe(true);
  });
});

describe('extractReferencesFromCodeableReferenceLike', () => {
  test('returns empty array for undefined input', () => {
    expect(extractReferencesFromCodeableReferenceLike(undefined)).toEqual([]);
  });

  test('returns empty array for concepts with no reference extension', () => {
    const concepts: CodeableConcept[] = [{ coding: [{ code: 'checkup' }] }];
    expect(extractReferencesFromCodeableReferenceLike(concepts)).toEqual([]);
  });

  test('only returns references for concepts that have the extension', () => {
    const service1: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'svc-1' };
    const service2: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'svc-2' };
    const concepts: CodeableConcept[] = [
      ...toCodeableReferenceLike(service1),
      { coding: [{ code: 'plain-no-ref' }] },
      ...toCodeableReferenceLike(service2),
    ];
    const refs = extractReferencesFromCodeableReferenceLike(concepts);
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.reference)).toContain('HealthcareService/svc-1');
    expect(refs.map((r) => r.reference)).toContain('HealthcareService/svc-2');
  });

  test('returns one reference per type entry when a service has multiple type entries', () => {
    const service: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      id: 'svc-1',
      type: [{ coding: [{ code: 'a' }] }, { coding: [{ code: 'b' }] }],
    };
    const refs = extractReferencesFromCodeableReferenceLike(toCodeableReferenceLike(service));
    expect(refs).toHaveLength(2);
    expect(refs.every((r) => r.reference === 'HealthcareService/svc-1')).toBe(true);
  });
});
