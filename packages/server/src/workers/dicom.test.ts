// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ContentType, createReference } from '@medplum/core';
import type { Binary, DicomInstance, DicomSeries, DicomStudy } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { Readable } from 'node:stream';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { Repository } from '../fhir/repo';
import { getLogger } from '../logger';
import { getBinaryStorage } from '../storage/loader';
import { createTestProject, streamToString, withTestContext } from '../test.setup';
import type { DicomJobData } from './dicom';
import { addDicomJobs, execDicomJob, getDicomQueue, initDicomWorker } from './dicom';
import { queueRegistry } from './utils';

let mockReadResult: { meta?: Record<string, unknown>; dict?: Record<string, unknown> };
let mockNaturalized: Record<string, unknown>;
const mockFromAsyncStream = jest.fn();
const mockReadFile = jest.fn();
const mockStartObject = jest.fn();

jest.mock('dcmjs', () => ({
  __esModule: true,
  default: {
    async: {
      AsyncDicomReader: jest.fn().mockImplementation(() => ({
        stream: {
          fromAsyncStream: mockFromAsyncStream,
        },
        readFile: mockReadFile,
      })),
    },
    data: {
      DicomMetaDictionary: {
        naturalizeDataset: jest.fn(() => mockNaturalized),
      },
    },
    utilities: {
      DicomMetadataListener: jest.fn().mockImplementation(() => ({
        startObject: mockStartObject,
      })),
    },
  },
}));

describe('DICOM Worker', () => {
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    repo = (await createTestProject({ withRepo: true })).repo;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    mockReadResult = { meta: { TransferSyntaxUID: '1.2.840.10008.1.2.4.50' }, dict: { PixelData: true } };
    mockNaturalized = {
      TransferSyntaxUID: '1.2.840.10008.1.2.4.50',
      PixelData: [new Uint8Array([1, 2, 3]).buffer],
    };
    mockFromAsyncStream.mockResolvedValue(undefined);
    mockReadFile.mockImplementation(async () => mockReadResult);
    mockStartObject.mockClear();
  });

  test('initializes queue without worker', () => {
    const result = initDicomWorker({} as any, { workerEnabled: false });
    expect(result.name).toBe('DicomQueue');
    expect(result.queue).toBeDefined();
    expect(result.worker).toBeUndefined();
  });

  test('getDicomQueue returns queue from registry', () => {
    const queue = { add: jest.fn() };
    jest.spyOn(queueRegistry, 'get').mockReturnValue(queue as any);
    expect(getDicomQueue()).toBe(queue);
  });

  test('addDicomJobs queues job when raw binary changes', async () => {
    const add = jest.fn();
    jest.spyOn(queueRegistry, 'get').mockReturnValue({ add } as any);

    await withTestContext(
      () =>
        addDicomJobs(
          {
            resourceType: 'DicomInstance',
            id: 'instance-id',
            raw: { reference: 'Binary/new' },
          } as DicomInstance & { id: string },
          {
            resourceType: 'DicomInstance',
            raw: { reference: 'Binary/old' },
          } as DicomInstance
        ),
      { requestId: 'request-id', traceId: 'trace-id' }
    );

    expect(add).toHaveBeenCalledWith('DicomJobData', {
      id: 'instance-id',
      requestId: 'request-id',
      traceId: 'trace-id',
    });
  });

  test('addDicomJobs skips job when raw binary is unchanged', async () => {
    const add = jest.fn();
    jest.spyOn(queueRegistry, 'get').mockReturnValue({ add } as any);

    await addDicomJobs(
      {
        resourceType: 'DicomInstance',
        id: 'instance-id',
        raw: { reference: 'Binary/same' },
      } as DicomInstance & { id: string },
      {
        resourceType: 'DicomInstance',
        raw: { reference: 'Binary/same' },
      } as DicomInstance
    );

    expect(add).not.toHaveBeenCalled();
  });

  test('execDicomJob skips deleted instances', async () => {
    const instance = await createDicomInstance();
    await repo.deleteResource('DicomInstance', instance.id);

    await expect(execDicomJob(createJob(instance.id))).resolves.toBeUndefined();
  });

  test('execDicomJob skips instance without metadata', async () => {
    const info = jest.spyOn(getLogger(), 'info').mockImplementation(() => undefined);
    const instance = await createDicomInstance();
    mockReadResult = { dict: { PixelData: true } };

    await execDicomJob(createJob(instance.id));

    expect(info).toHaveBeenCalledWith('No DICOM metadata found in instance', { id: instance.id });
  });

  test('execDicomJob skips instance without DICOM dict', async () => {
    const info = jest.spyOn(getLogger(), 'info').mockImplementation(() => undefined);
    const instance = await createDicomInstance();
    mockReadResult = { meta: { TransferSyntaxUID: '1.2.840.10008.1.2.4.50' } };

    await execDicomJob(createJob(instance.id));

    expect(info).toHaveBeenCalledWith('No DICOM metadata found in instance', { id: instance.id });
  });

  test('execDicomJob skips instance without pixel data', async () => {
    const info = jest.spyOn(getLogger(), 'info').mockImplementation(() => undefined);
    const instance = await createDicomInstance();
    mockNaturalized = { TransferSyntaxUID: '1.2.840.10008.1.2.4.50' };

    await execDicomJob(createJob(instance.id));

    expect(info).toHaveBeenCalledWith('No PixelData found in DICOM instance', { id: instance.id });
  });

  test('execDicomJob skips empty pixel data array', async () => {
    const info = jest.spyOn(getLogger(), 'info').mockImplementation(() => undefined);
    const instance = await createDicomInstance();
    mockNaturalized = { TransferSyntaxUID: '1.2.840.10008.1.2.4.50', PixelData: [] };

    await execDicomJob(createJob(instance.id));

    expect(info).toHaveBeenCalledWith('PixelData is empty or not an array', { id: instance.id, pixelData: [] });
  });

  test('execDicomJob logs unexpected nested pixel data and stores valid frames', async () => {
    const info = jest.spyOn(getLogger(), 'info').mockImplementation(() => undefined);
    const instance = await createDicomInstance({
      pixelData: [{ reference: 'Binary/replaced' }],
    });
    mockNaturalized = {
      TransferSyntaxUID: '1.2.840.10008.1.2.4.90',
      PixelData: [[new Uint8Array([4, 5]).buffer], 'unexpected'],
    };

    await execDicomJob(createJob(instance.id));

    expect(info).toHaveBeenCalledWith('Unexpected PixelData format', { id: instance.id, pixelData: 'unexpected' });
    const updated = await repo.readResource<DicomInstance>('DicomInstance', instance.id);
    expect(updated.meta?.author?.reference).toBe('system');
    expect(updated.pixelData).toHaveLength(1);
    const binary = await repo.readReference<Binary>(getFirstPixelData(updated));
    expect(binary.contentType).toBe('image/jp2');
    await expect(streamToString(await getBinaryStorage().readBinary(binary))).resolves.toBe('\u0004\u0005');
  });

  test('execDicomJob stores pixel data using default content type', async () => {
    const instance = await createDicomInstance();
    mockNaturalized = {
      TransferSyntaxUID: 'unknown',
      PixelData: [new Uint8Array([6, 7]).buffer],
    };

    await execDicomJob(createJob(instance.id));

    const updated = await repo.readResource<DicomInstance>('DicomInstance', instance.id);
    expect(updated.pixelData).toHaveLength(1);
    const binary = await repo.readReference<Binary>(getFirstPixelData(updated));
    expect(binary.contentType).toBe(ContentType.OCTET_STREAM);
  });

  test.each([
    ['1.2.840.10008.1.2.4.50', 'image/jpeg'],
    ['1.2.840.10008.1.2.4.57', 'image/jpeg'],
    ['1.2.840.10008.1.2.4.70', 'image/jpeg'],
    ['1.2.840.10008.1.2.4.91', 'image/jp2'],
    ['1.2.840.10008.1.2.4.201', 'image/jxl'],
    ['1.2.840.10008.1.2.4.202', 'image/jxl'],
  ])('execDicomJob maps transfer syntax %s to %s', async (transferSyntaxUid, expectedContentType) => {
    const instance = await createDicomInstance();
    mockNaturalized = {
      TransferSyntaxUID: transferSyntaxUid,
      PixelData: [new Uint8Array([8]).buffer],
    };

    await execDicomJob(createJob(instance.id));

    const updated = await repo.readResource<DicomInstance>('DicomInstance', instance.id);
    const binary = await repo.readReference<Binary>(getFirstPixelData(updated));
    expect(binary.contentType).toBe(expectedContentType);
  });

  test('execDicomJob rethrows missing non-deleted instances', async () => {
    await expect(execDicomJob(createJob('00000000-0000-0000-0000-000000000000'))).rejects.toMatchObject({
      outcome: {
        issue: [expect.objectContaining({ code: 'not-found' })],
      },
    });
  });

  test('execDicomJob rethrows processing errors', async () => {
    const info = jest.spyOn(getLogger(), 'info').mockImplementation(() => undefined);
    const instance = await createDicomInstance();
    mockReadFile.mockRejectedValueOnce(new Error('reader failed'));

    await expect(execDicomJob(createJob(instance.id))).rejects.toThrow('reader failed');
    expect(info).toHaveBeenCalledWith('DICOM processing error', { id: instance.id, err: expect.any(Error) });
  });

  async function createDicomInstance(options?: Partial<DicomInstance>): Promise<DicomInstance & { id: string }> {
    const raw = await repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType: 'application/dicom',
    });
    await getBinaryStorage().writeBinary(raw, 'instance.dcm', 'application/dicom', Readable.from(Buffer.from('dicom')));

    const study = await repo.createResource<DicomStudy>({
      resourceType: 'DicomStudy',
      studyInstanceUid: `study-${Date.now()}-${Math.random()}`,
    });
    const series = await repo.createResource<DicomSeries>({
      resourceType: 'DicomSeries',
      study: createReference(study),
      seriesInstanceUid: `series-${Date.now()}-${Math.random()}`,
    });

    return repo.createResource<DicomInstance>({
      resourceType: 'DicomInstance',
      study: createReference(study),
      series: createReference(series),
      sopClassUid: '1.2.3',
      sopInstanceUid: `instance-${Date.now()}-${Math.random()}`,
      metadata: '{}',
      raw: createReference(raw),
      ...options,
    });
  }
});

function createJob(id: string): Job<DicomJobData> {
  return { data: { id } } as Job<DicomJobData>;
}

function getFirstPixelData(instance: DicomInstance): NonNullable<DicomInstance['pixelData']>[number] {
  expect(instance.pixelData).toHaveLength(1);
  return instance.pixelData?.[0] as NonNullable<DicomInstance['pixelData']>[number];
}
