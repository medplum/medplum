import { OperationOutcome, Patient, PatientLink, ServiceRequest } from '@medplum/fhirtypes';
import { linkPatientRecords, mergeContactInfo, rewriteClinicalResources } from './deduplication';
import { createReference } from './utils';
import { FetchLike, MedplumClient } from './client';
import { ContentType } from './contenttype';
import { getStatus, isOperationOutcome } from './outcomes';

function mockFetch(
  status: number,
  body: OperationOutcome | Record<string, unknown> | ((url: string, options?: any) => any),
  contentType = ContentType.FHIR_JSON
): FetchLike & jest.Mock {
  const bodyFn = typeof body === 'function' ? body : () => body;
  return jest.fn((url: string, options?: any) => {
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
      link: [{ other: createReference({ resourceType: 'Patient', id: '123' }), type: 'seeAlso' }] as PatientLink,
    } as Patient;

    const result = linkPatientRecords(srcPatient, targetPatient);

    expect(result.src.link?.length).toBe(1);
    expect(result.target.link?.length).toBe(2);
    expect(result.target.link?.[1]).toEqual({
      other: { display: 'Homer Simpson', reference: 'Patient/src' },
      type: 'replaces',
    });
  });

  test('should merge contact info correctly', () => {
    const srcPatient = {
      resourceType: 'Patient',
      id: 'src',
      identifier: [{ use: 'usual', value: '123' }],
    } as Patient;

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      identifier: [{ use: 'official', value: '456' }],
    } as Patient;

    const fields = {
      address: [{ city: 'Springfield' }],
    };
    const result = mergeContactInfo(srcPatient, targetPatient, fields);

    // Assertions
    expect(result.src).toEqual(srcPatient);
    expect(result.target.id).toBe('target');
    expect(result.target.address).toBe(fields.address);
    expect(result.target.identifier).toEqual([
      { use: 'official', value: '456' },
      { use: 'old', value: '123' },
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
      identifier: [{ use: 'usual', value: '123', system: 'http://medplum.com' }],
    } as Patient;

    const fields = {
      address: [{ city: 'Springfield' }],
    };

    const result = mergeContactInfo(srcPatient, targetPatient, fields);

    expect(result.src).toEqual(srcPatient);
    expect(result.target.id).toBe('target');
    expect(result.target.address).toBe(fields.address);
    expect(result.target.identifier).toEqual([{ use: 'usual', value: '123', system: 'http://medplum.com' }]);
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
    const fetch = mockFetch(200, { resourceType: 'Bundle', entry: [clinicalResource] });
    const client = new MedplumClient({ fetch });

    const targetPatient = {
      resourceType: 'Patient',
      id: 'target',
      name: [{ given: ['Lisa'], family: 'Simpson' }],
    } as Patient;

    await rewriteClinicalResources(client, srcPatient, targetPatient, 'ServiceRequest');
  });
});
