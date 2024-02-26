import { ContentType, MedplumClient, createReference, getStatus, isOperationOutcome } from '@medplum/core';
import { OperationOutcome, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { Mock, vi } from 'vitest';
import {
  linkPatientRecords,
  mergePatientRecords,
  patientsAlreadyMerged,
  unlinkPatientRecords,
  updateResourceReferences,
} from './merge-matching-patients';

function mockFetch(
  status: number,
  body: OperationOutcome | Record<string, unknown> | ((url: string, options?: any) => any),
  contentType = ContentType.FHIR_JSON
): Mock {
  const bodyFn = typeof body === 'function' ? body : () => body;
  return vi.fn((url: string, options?: any) => {
    const response = bodyFn(url, options);
    const responseStatus = isOperationOutcome(response) ? getStatus(response) : status;
    return Promise.resolve({
      ok: responseStatus < 400,
      status: responseStatus,
      headers: { get: () => contentType },
      blob: () => Promise.resolve(response),
      json: () => Promise.resolve(response),
    });
  });
}

describe('Deduplication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('should link two patient records correctly', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      name: [{ given: ['Homer'], family: 'Simpson' }],
    } as Patient;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      name: [{ given: ['Lisa'], family: 'Simpson' }],
    } as Patient;

    const result = linkPatientRecords(srcPatient, targetPatient);

    expect(result.src.id).toBe('src');
    expect(result.target.id).toBe('target');

    expect(result.src.link).toEqual([
      { other: { reference: 'Patient/target', display: 'Lisa Simpson' }, type: 'replaced-by' },
    ]);
    expect(result.src.active).toBe(false);

    expect(result.target.link).toEqual([
      { other: { reference: 'Patient/src', display: 'Homer Simpson' }, type: 'replaces' },
    ]);
  });

  test('should handle patients without existing links', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      name: [{ given: ['Homer'], family: 'Simpson' }],
    } as Patient;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      name: [{ given: ['Lisa'], family: 'Simpson' }],
      link: [{ other: [createReference({ resourceType: 'Patient', id: '123' })], type: 'seealso' }],
    } as Patient;

    const result = linkPatientRecords(srcPatient, targetPatient);

    expect(result.src.link?.length).toBe(1);
    expect(result.target.link?.length).toBe(2);
    expect(result.target.link?.[1]).toEqual({
      other: { display: 'Homer Simpson', reference: 'Patient/src' },
      type: 'replaces',
    });
  });

  test('should unlink patients', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      active: false,
      name: [{ given: ['Homer'], family: 'Simpson' }],
      link: [{ other: { reference: 'Patient/target' }, type: 'replaced-by' }],
    } as Patient;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      active: true,
      name: [{ given: ['Lisa'], family: 'Simpson' }],
      link: [{ other: createReference(srcPatient), type: 'replaces' }],
    } as Patient;

    const result = unlinkPatientRecords(srcPatient, targetPatient);

    expect(result.src.link?.length).toBe(0);
    expect(result.target.link?.length).toBe(0);
    expect(result.src.active).toBe(true);
  });

  test('should merge contact info correctly', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      identifier: [{ use: 'usual', system: 'http://foo.org', value: '123' }],
    } as Patient;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      identifier: [{ use: 'official', system: 'http://bar.org', value: '456' }],
    } as Patient;

    const fields = {
      address: [{ city: 'Springfield' }],
    };
    const result = mergePatientRecords(srcPatient, targetPatient, fields);

    // Assertions
    expect(result.src).toEqual(srcPatient);
    expect(result.target.id).toBe('target');
    expect(result.target.address).toBe(fields.address);
    expect(result.target.identifier).toEqual([
      { use: 'official', system: 'http://bar.org', value: '456' },
      { use: 'old', system: 'http://foo.org', value: '123' },
    ]);
  });

  test('should handle patients without identifiers in source', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
    } as Patient;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      identifier: [{ use: 'usual', value: '123', system: 'http://example.org' }],
    } as Patient;

    const fields = {
      address: [{ city: 'Springfield' }],
    };

    const result = mergePatientRecords(srcPatient, targetPatient, fields);

    expect(result.src).toEqual(srcPatient);
    expect(result.target.id).toBe('target');
    expect(result.target.address).toBe(fields.address);
    expect(result.target.identifier).toEqual([{ use: 'usual', value: '123', system: 'http://example.org' }]);
  });

  test('Should rewrite Clinical Resource to new patient', async () => {
    const clinicalResource = {
      resourceType: 'ServiceRequest',
      id: '123',
      subject: { reference: 'Patient/src' },
    } as ServiceRequest;
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
    } as Patient;
    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      name: [{ given: ['Lisa'], family: 'Simpson' }],
    } as Patient;
    const fetch = mockFetch(200, (url: string) => {
      if (url.includes('subject=')) {
        return {
          resourceType: 'Bundle',
          entry: [{ resource: { ...clinicalResource } }],
        };
      } else if (url.includes('ServiceRequest/123')) {
        return {
          resourceType: 'ServiceRequest',
          id: '123',
          subject: { reference: 'Patient/target' },
        };
      }
      return {};
    });
    const client = new MedplumClient({ fetch });

    await updateResourceReferences(client, srcPatient, targetPatient, 'ServiceRequest');
    const clinicalResourceUpdated = (await client.readResource('ServiceRequest', '123')) as ServiceRequest;
    expect(clinicalResourceUpdated.subject).toEqual({ reference: 'Patient/target' });
  });

  describe('Patients already linked', async () => {
    interface TestMergedPatients {
      master: Patient;
      source: Patient;
      target: Patient;
    }
    beforeEach<TestMergedPatients>((context) => {
      context.master = {
        resourceType: 'Patient',
        id: 'src',
        active: true,
      } as Patient;
      context.target = {
        resourceType: 'Patient',
        id: 'target',
        name: [{ given: ['Lisa'], family: 'Simpson' }],
        link: [{ other: createReference(context.master), type: 'replaced-by' }],
      } as Patient;

      context.source = {
        resourceType: 'Patient',
        id: 'target',
        name: [{ given: ['Lisa', 'L'], family: 'Simpson' }],
        link: [{ other: createReference(context.master), type: 'replaced-by' }],
      } as Patient;

      context.master.link = [
        { type: 'replaces', other: createReference(context.source) },
        { type: 'replaces', other: createReference(context.target) },
      ];
    });
    test<TestMergedPatients>('Patients share a master resource', async ({ source, target }) => {
      expect(patientsAlreadyMerged(source, target)).toBe(true);
    });

    test<TestMergedPatients>('Target is master resource', async ({ source, master }) => {
      expect(patientsAlreadyMerged(source, master)).toBe(true);
    });

    test<TestMergedPatients>('Source is a master resource', async ({ master, target }) => {
      expect(patientsAlreadyMerged(master, target)).toBe(true);
    });
  });
});
