import { OperationOutcome, Patient, PatientLink, ServiceRequest } from '@medplum/fhirtypes';
import {
  createMasterResource,
  linkPatientRecords,
  mergePatientRecords,
  updateClinicalReferences,
} from './deduplication';
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
  beforeEach(() => {
    jest.resetAllMocks();
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
    const result = mergePatientRecords(srcPatient, targetPatient, fields);

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

    const result = mergePatientRecords(srcPatient, targetPatient, fields);

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

    await updateClinicalReferences(client, srcPatient, targetPatient, 'ServiceRequest');
    const clinicalResourceUpdated = (await client.readResource('ServiceRequest', '123')) as ServiceRequest;
    expect(clinicalResourceUpdated.subject).toEqual({ reference: 'Patient/target' });
  });

  test('Either resource has 2 links with type replaced-by', async () => {
    const srcPatient: Patient = {
      resourceType: 'Patient',
      link: [
        { type: 'replaced-by', other: { reference: 'Patient/123' } },
        { type: 'replaced-by', other: { reference: 'Patient/234' } },
      ],
    };

    const targetPatient: Patient = {
      resourceType: 'Patient',
    };
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });

    await expect(createMasterResource(client, srcPatient, targetPatient)).rejects.toThrow(
      'Either resource has 2 links with type replaced-by'
    );
  });

  test('Both resources have 1 link with type replaced-by', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const srcPatient: Patient = {
      resourceType: 'Patient',
      link: [{ type: 'replaced-by', other: { reference: 'Patient/123' } }],
    };

    const targetPatient: Patient = {
      resourceType: 'Patient',
      link: [{ type: 'replaced-by', other: { reference: 'Patient/123' } }],
    };

    await expect(createMasterResource(client, srcPatient, targetPatient)).rejects.toThrow(
      'Both resources have 1 link with type replaced-by'
    );
  });

  test('One has replace-by and the other has replaces', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const srcPatient: Patient = {
      resourceType: 'Patient',
      link: [{ type: 'replaced-by', other: { reference: 'Patient/123' } }],
    };

    const targetPatient: Patient = {
      resourceType: 'Patient',
      link: [{ type: 'replaces', other: { reference: 'Patient/123' } }],
    };

    await expect(createMasterResource(client, srcPatient, targetPatient)).rejects.toThrow(
      'There is already a master with the input id'
    );
  });

  test('Happy path - Neither has replace-by', async () => {
    const mockMedplumClient = {
      createResource: jest.fn(),
    };

    const srcPatient: Patient = {
      resourceType: 'Patient',
    };

    const targetPatient: Patient = {
      resourceType: 'Patient',
    };

    await createMasterResource(mockMedplumClient as any, srcPatient, targetPatient);

    expect(mockMedplumClient.createResource).toHaveBeenCalledWith(targetPatient);
  });

  test('Source has a replaced-by link', async () => {
    const mockMedplumClient = {
      createResource: jest.fn(),
      readReference: jest.fn(),
      updateResource: jest.fn(),
    };
    const srcPatient: Patient = {
      resourceType: 'Patient',
      link: [{ type: 'replaced-by', other: { reference: 'Patient/masterSrc' } }],
    };

    const targetPatient: Patient = {
      resourceType: 'Patient',
    };

    const mockMasterPatient = {
      resourceType: 'Patient',
      id: 'masterSrc',
    };

    // Mocking readReference to return the mock master patient for the source
    mockMedplumClient.readReference = jest.fn().mockResolvedValue(mockMasterPatient);

    await createMasterResource(mockMedplumClient as any, srcPatient, targetPatient);

    expect(mockMedplumClient.updateResource).toHaveBeenCalled();
  });

  test('Target has a replaced-by link', async () => {
    const mockMedplumClient = {
      createResource: jest.fn(),
      readReference: jest.fn(),
      updateResource: jest.fn(),
    };
    const srcPatient: Patient = {
      resourceType: 'Patient',
    };

    const targetPatient: Patient = {
      resourceType: 'Patient',
      link: [{ type: 'replaced-by', other: { reference: 'Patient/masterTarget' } }],
    };

    const mockMasterPatient = {
      resourceType: 'Patient',
      id: 'masterTarget',
    };

    // Mocking readReference to return the mock master patient for the target
    mockMedplumClient.readReference = jest.fn().mockResolvedValue(mockMasterPatient);

    await createMasterResource(mockMedplumClient as any, srcPatient, targetPatient);

    expect(mockMedplumClient.updateResource).toHaveBeenCalled();
  });
});
