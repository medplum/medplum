// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Ported from examples/medplum-demo-bots/src/deduplication/merge-matching-patients.test.ts
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Patient, ServiceRequest } from '@medplum/fhirtypes';
import {
  linkPatientRecords,
  mergePatientRecords,
  patientsAlreadyMerged,
  replaceReferences,
  unlinkPatientRecords,
} from '@medplum/core';

describe('Patient Merge Utils', () => {
  test('should link two patient records correctly', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      name: [{ given: ['Homer'], family: 'Simpson' }],
    } as WithId<Patient>;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      name: [{ given: ['Lisa'], family: 'Simpson' }],
    } as WithId<Patient>;

    const result = linkPatientRecords(srcPatient, targetPatient);

    expect(result.src.id).toBe('src');
    expect(result.target.id).toBe('target');

    expect(result.src.link).toHaveLength(1);
    expect(result.src.link?.[0].type).toBe('replaced-by');
    expect(result.src.link?.[0].other.reference).toBe('Patient/target');
    expect(result.src.active).toBe(false);

    expect(result.target.link).toHaveLength(1);
    expect(result.target.link?.[0].type).toBe('replaces');
    expect(result.target.link?.[0].other.reference).toBe('Patient/src');
  });

  test('should handle patients with existing links', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      name: [{ given: ['Homer'], family: 'Simpson' }],
    } as WithId<Patient>;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      name: [{ given: ['Lisa'], family: 'Simpson' }],
      link: [{ other: createReference({ resourceType: 'Patient', id: '123' }), type: 'seealso' }],
    } as WithId<Patient>;

    const result = linkPatientRecords(srcPatient, targetPatient);

    expect(result.src.link?.length).toBe(1);
    expect(result.target.link?.length).toBe(2);
    expect(result.target.link?.[1].type).toBe('replaces');
    expect(result.target.link?.[1].other.reference).toBe('Patient/src');
  });

  test('should unlink patients', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      active: false,
      name: [{ given: ['Homer'], family: 'Simpson' }],
      link: [{ other: { reference: 'Patient/target' }, type: 'replaced-by' }],
    } as WithId<Patient>;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      active: true,
      name: [{ given: ['Lisa'], family: 'Simpson' }],
      link: [{ other: createReference(srcPatient), type: 'replaces' }],
    } as WithId<Patient>;

    const result = unlinkPatientRecords(srcPatient, targetPatient);

    expect(result.src.link?.length).toBe(0);
    expect(result.target.link?.length).toBe(0);
    // Active status should remain unchanged (we don't infer user intent)
    expect(result.src.active).toBe(false);
  });

  test('should unlink patients with multiple replaced-by links', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      active: false,
      link: [
        { other: { reference: 'Patient/master' }, type: 'replaced-by' },
        { other: { reference: 'Patient/target' }, type: 'replaced-by' },
      ],
    } as WithId<Patient>;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      link: [{ other: createReference(srcPatient), type: 'replaces' }],
    } as WithId<Patient>;

    const result = unlinkPatientRecords(srcPatient, targetPatient);

    // Should only remove the link to target, keep the link to master
    expect(result.src.link?.length).toBe(1);
    expect(result.src.link?.[0].other.reference).toBe('Patient/master');
    expect(result.target.link?.length).toBe(0);
    // Active status should remain unchanged (we don't infer user intent)
    expect(result.src.active).toBe(false);
  });

  test('should not change active status when unlinking', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      active: false,
      link: [{ other: { reference: 'Patient/target' }, type: 'replaced-by' }],
    } as WithId<Patient>;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      link: [{ other: createReference(srcPatient), type: 'replaces' }],
    } as WithId<Patient>;

    const result = unlinkPatientRecords(srcPatient, targetPatient);

    // Active status should remain unchanged (we don't infer user intent)
    expect(result.src.active).toBe(false);
    expect(result.src.link?.length).toBe(0);
  });

  test('should merge identifiers correctly', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      identifier: [{ use: 'usual', system: 'http://foo.org', value: '123' }],
    } as WithId<Patient>;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      identifier: [{ use: 'official', system: 'http://bar.org', value: '456' }],
    } as WithId<Patient>;

    const fields = {
      address: [{ city: 'Springfield' }],
    };
    const result = mergePatientRecords(srcPatient, targetPatient, fields);

    expect(result.src).toStrictEqual(srcPatient);
    expect(result.target.id).toBe('target');
    expect(result.target.address).toBe(fields.address);
    expect(result.target.identifier).toHaveLength(2);
    expect(result.target.identifier?.[0]).toMatchObject({ use: 'official', system: 'http://bar.org', value: '456' });
    expect(result.target.identifier?.[1]).toMatchObject({ use: 'old', system: 'http://foo.org', value: '123' });
  });

  test('should not duplicate identical identifiers', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      identifier: [{ use: 'usual', system: 'http://foo.org', value: '123' }],
    } as WithId<Patient>;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      identifier: [{ use: 'official', system: 'http://foo.org', value: '123' }], // Same system and value
    } as WithId<Patient>;

    const result = mergePatientRecords(srcPatient, targetPatient);

    // Should only have one identifier since they're identical
    expect(result.target.identifier).toHaveLength(1);
    expect(result.target.identifier?.[0]).toMatchObject({ system: 'http://foo.org', value: '123' });
  });

  test('should handle multiple identifiers from source', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      identifier: [
        { use: 'usual', system: 'http://foo.org', value: '123' },
        { use: 'temp', system: 'http://bar.org', value: '456' },
      ],
    } as WithId<Patient>;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      identifier: [{ use: 'official', system: 'http://baz.org', value: '789' }],
    } as WithId<Patient>;

    const result = mergePatientRecords(srcPatient, targetPatient);

    expect(result.target.identifier).toHaveLength(3);
    expect(result.target.identifier?.find((id) => id.system === 'http://foo.org')?.use).toBe('old');
    expect(result.target.identifier?.find((id) => id.system === 'http://bar.org')?.use).toBe('old');
    expect(result.target.identifier?.find((id) => id.system === 'http://baz.org')?.use).toBe('official');
  });

  test('should handle patients without identifiers in source', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
    } as WithId<Patient>;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      identifier: [{ use: 'usual', value: '123', system: 'http://example.org' }],
    } as WithId<Patient>;

    const fields = {
      address: [{ city: 'Springfield' }],
    };

    const result = mergePatientRecords(srcPatient, targetPatient, fields);

    expect(result.src).toStrictEqual(srcPatient);
    expect(result.target.id).toBe('target');
    expect(result.target.address).toBe(fields.address);
    expect(result.target.identifier).toStrictEqual([{ use: 'usual', value: '123', system: 'http://example.org' }]);
  });

  test('should throw error on conflicting identifier values', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      identifier: [{ use: 'usual', system: 'http://foo.org', value: '123' }],
    } as WithId<Patient>;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      identifier: [{ use: 'official', system: 'http://foo.org', value: '456' }],
    } as WithId<Patient>;

    expect(() => mergePatientRecords(srcPatient, targetPatient)).toThrow('Mismatched identifier for system');
  });

  test('should replace references recursively', () => {
    const clinicalResource: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: '123',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/src' },
      requester: { reference: 'Patient/src' },
      encounter: { reference: 'Encounter/1' },
      note: [
        {
          text: 'Test note',
          authorReference: { reference: 'Patient/src' },
        },
        {
          text: 'Another note',
          authorReference: { reference: 'Practitioner/1' }, // Should not change
        },
      ],
    };

    replaceReferences(clinicalResource, 'Patient/src', 'Patient/target');

    expect(clinicalResource.subject?.reference).toBe('Patient/target');
    expect(clinicalResource.requester?.reference).toBe('Patient/target');
    expect(clinicalResource.encounter?.reference).toBe('Encounter/1'); // Should not change
    expect(clinicalResource.note?.[0]?.authorReference?.reference).toBe('Patient/target');
    expect(clinicalResource.note?.[1]?.authorReference?.reference).toBe('Practitioner/1'); // Should not change
  });

  test('should replace references in arrays', () => {
    const resource = {
      resourceType: 'Observation',
      id: '123',
      subject: { reference: 'Patient/src' },
      performer: [{ reference: 'Patient/src' }, { reference: 'Practitioner/1' }, { reference: 'Patient/src' }],
      component: [
        {
          valueReference: { reference: 'Patient/src' },
        },
      ],
    } as any;

    replaceReferences(resource, 'Patient/src', 'Patient/target');

    expect(resource.subject.reference).toBe('Patient/target');
    expect(resource.performer[0].reference).toBe('Patient/target');
    expect(resource.performer[1].reference).toBe('Practitioner/1'); // Should not change
    expect(resource.performer[2].reference).toBe('Patient/target');
    expect(resource.component[0].valueReference.reference).toBe('Patient/target');
  });

  test('should handle null and undefined values', () => {
    const resource = {
      resourceType: 'Observation',
      id: '123',
      subject: { reference: 'Patient/src' },
      value: null,
      status: undefined,
      empty: {},
    } as any;

    replaceReferences(resource, 'Patient/src', 'Patient/target');

    expect(resource.subject.reference).toBe('Patient/target');
    expect(resource.value).toBeNull();
    expect(resource.status).toBeUndefined();
  });

  test('should handle empty objects', () => {
    const resource = {
      resourceType: 'Observation',
      id: '123',
      subject: { reference: 'Patient/src' },
      empty: {},
      nested: {
        empty: {},
        value: 'test',
      },
    } as any;

    replaceReferences(resource, 'Patient/src', 'Patient/target');

    expect(resource.subject.reference).toBe('Patient/target');
    expect(resource.empty).toEqual({});
    expect(resource.nested.empty).toEqual({});
    expect(resource.nested.value).toBe('test');
  });

  describe('patientsAlreadyMerged', () => {
    test('should return true when patients share a master resource', () => {
      const master = {
        resourceType: 'Patient',
        id: 'master',
        active: true,
      } as Patient;

      const source = {
        resourceType: 'Patient',
        id: 'source',
        link: [{ other: createReference(master), type: 'replaced-by' }],
      } as Patient;

      const target = {
        resourceType: 'Patient',
        id: 'target',
        link: [{ other: createReference(master), type: 'replaced-by' }],
      } as Patient;

      master.link = [
        { type: 'replaces', other: createReference(source) },
        { type: 'replaces', other: createReference(target) },
      ];

      expect(patientsAlreadyMerged(source, target)).toBe(true);
    });

    test('should return true when target is master resource', () => {
      const source = {
        resourceType: 'Patient',
        id: 'source',
        link: [{ other: { reference: 'Patient/target' }, type: 'replaced-by' }],
      } as Patient;

      const target = {
        resourceType: 'Patient',
        id: 'target',
        link: [{ other: { reference: 'Patient/source' }, type: 'replaces' }],
      } as Patient;

      expect(patientsAlreadyMerged(source, target)).toBe(true);
    });

    test('should return true when source is master resource', () => {
      const source = {
        resourceType: 'Patient',
        id: 'source',
        link: [{ other: { reference: 'Patient/target' }, type: 'replaces' }],
      } as Patient;

      const target = {
        resourceType: 'Patient',
        id: 'target',
        link: [{ other: { reference: 'Patient/source' }, type: 'replaced-by' }],
      } as Patient;

      expect(patientsAlreadyMerged(source, target)).toBe(true);
    });

    test('should throw error when link structure is inconsistent', () => {
      const source = {
        resourceType: 'Patient',
        id: 'source',
        link: [{ other: { reference: 'Patient/target' }, type: 'replaced-by' }],
      } as Patient;

      const target = {
        resourceType: 'Patient',
        id: 'target',
        link: [], // Missing replaces link
      } as Patient;

      expect(() => patientsAlreadyMerged(source, target)).toThrow("missing a 'replaces' link");
    });

    test('should return false when patients are not merged', () => {
      const source = {
        resourceType: 'Patient',
        id: 'source',
      } as Patient;

      const target = {
        resourceType: 'Patient',
        id: 'target',
      } as Patient;

      expect(patientsAlreadyMerged(source, target)).toBe(false);
    });
  });
});
