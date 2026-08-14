// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference, OperationOutcomeError, preconditionFailed } from '@medplum/core';
import type { DicomInstance, DicomSeries, DicomStudy } from '@medplum/fhirtypes';
import type { DcmjsDicomDict } from 'dcmjs';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { Repository } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import {
  cleanDicomJsonDict,
  dcmjsSeriesToMedplumSeries,
  dcmjsStudyToMedplumStudy,
  dicomDateToFhirDate,
  dicomPersonNameToString,
  dicomTimeToFhirTime,
  fhirDateToDicomDate,
  fhirTimeToDicomTime,
  medplumSeriesToDcmjsSeries,
  medplumStudyToDcmjsStudy,
  parseQueryInt,
  stringToDicomPersonName,
  updateSeriesAggregates,
  updateStudyAggregates,
  writeMultipartRelatedBody,
} from './utils';

describe('DICOM utils', () => {
  test('converts DICOM study metadata to Medplum study', () => {
    expect(
      dcmjsStudyToMedplumStudy({
        StudyInstanceUID: 'study-uid',
        StudyID: 'study-id',
        StudyDate: '20240102',
        StudyTime: '030405',
        AccessionNumber: 'A123',
        InstanceAvailability: 'ONLINE',
        ModalitiesInStudy: ['CT'],
        ReferringPhysiciansName: 'Dr Test',
        TimezoneOffsetFromUTC: '-0700',
        PatientName: [{ Alphabetic: 'TEST^PATIENT ' }],
        PatientID: 'P123',
        PatientBirthDate: '20000101',
        PatientSex: 'O',
        NumberOfStudyRelatedSeries: 2,
        NumberOfStudyRelatedInstances: 3,
      })
    ).toMatchObject({
      resourceType: 'DicomStudy',
      studyInstanceUid: 'study-uid',
      studyId: 'study-id',
      studyDate: '2024-01-02',
      studyTime: '03:04:05',
      accessionNumber: 'A123',
      patientName: 'TEST^PATIENT',
      patientBirthDate: '2000-01-01',
      numberOfStudyRelatedSeries: 2,
      numberOfStudyRelatedInstances: 3,
    });
  });

  test('converts Medplum study metadata to DICOM naturalized metadata', () => {
    expect(
      medplumStudyToDcmjsStudy({
        resourceType: 'DicomStudy',
        studyInstanceUid: 'study-uid',
        studyId: 'study-id',
        studyDate: '2024-01-02',
        studyTime: '03:04:05',
        accessionNumber: 'A123',
        patientName: 'TEST^PATIENT',
        patientBirthDate: '2000-01-01',
        modalitiesInStudy: ['CT', 'PT'],
        numberOfStudyRelatedSeries: 2,
        numberOfStudyRelatedInstances: 3,
      })
    ).toMatchObject({
      StudyInstanceUID: 'study-uid',
      StudyID: 'study-id',
      StudyDate: '20240102',
      StudyTime: '030405',
      AccessionNumber: 'A123',
      ModalitiesInStudy: ['CT', 'PT'],
      PatientName: [{ Alphabetic: 'TEST^PATIENT' }],
      PatientBirthDate: '20000101',
      NumberOfStudyRelatedSeries: 2,
      NumberOfStudyRelatedInstances: 3,
    });
  });

  test('converts series metadata in both directions', () => {
    const study = { resourceType: 'DicomStudy' as const, id: 'study-id', studyInstanceUid: 'study-uid' };
    const studyRef = { reference: 'DicomStudy/study-id' };

    expect(
      dcmjsSeriesToMedplumSeries(studyRef, {
        SeriesInstanceUID: 'series-uid',
        SeriesNumber: 7,
        Modality: 'CT',
        SeriesDescription: 'Head CT',
        TimezoneOffsetFromUTC: '-0700',
        NumberOfSeriesRelatedInstances: 4,
        PerformedProcedureStepStartDate: '20240102',
        PerformedProcedureStepStartTime: '030405',
      })
    ).toMatchObject({
      resourceType: 'DicomSeries',
      study: studyRef,
      seriesInstanceUid: 'series-uid',
      seriesNumber: '7',
      modality: 'CT',
      seriesDescription: 'Head CT',
      numberOfSeriesRelatedInstances: 4,
      // DICOM DA and TM, reformatted to the FHIR date and time the elements are typed as
      performedProcedureStepStartDate: '2024-01-02',
      performedProcedureStepStartTime: '03:04:05',
    });

    expect(
      medplumSeriesToDcmjsSeries(study, {
        resourceType: 'DicomSeries',
        study: studyRef,
        seriesInstanceUid: 'series-uid',
        seriesNumber: '7',
        modality: 'CT',
        seriesDescription: 'Head CT',
        numberOfSeriesRelatedInstances: 4,
        performedProcedureStepStartDate: '2024-01-02',
        performedProcedureStepStartTime: '03:04:05',
      })
    ).toMatchObject({
      StudyInstanceUID: 'study-uid',
      SeriesInstanceUID: 'series-uid',
      SeriesNumber: 7,
      Modality: 'CT',
      NumberOfSeriesRelatedInstances: 4,
      PerformedProcedureStepStartDate: '20240102',
      PerformedProcedureStepStartTime: '030405',
    });
  });

  test('cleans DICOM JSON metadata', () => {
    const smallBinary = new Uint8Array([1, 2, 3]);
    const largeBinary = new Uint8Array(11 * 1024);
    const dict: DcmjsDicomDict = {
      '00020010': { vr: 'UI', Value: ['1.2.840.10008.1.2.1'] },
      '7FE00010': { vr: 'OB', Value: [smallBinary] },
      '60003000': { vr: 'OB', Value: [smallBinary] },
      '00100010': { vr: 'PN', Value: [{ Alphabetic: 'TEST^PATIENT' }] },
      '00081110': {
        vr: 'SQ',
        Value: [
          {
            '00020010': { vr: 'UI', Value: ['removed'] },
            '00081155': { vr: 'UI', Value: ['kept'] },
          },
          'unchanged',
        ],
      },
      '00290010': { vr: 'OB', Value: [smallBinary.buffer] },
      '00290011': { vr: 'OB', Value: [smallBinary] },
      '00290012': { vr: 'OB', Value: [largeBinary] },
      '00290013': { vr: 'OB', Value: [{}] },
    };

    expect(cleanDicomJsonDict(dict)).toEqual({
      '00100010': { vr: 'PN', Value: [{ Alphabetic: 'TEST^PATIENT' }] },
      '00081110': {
        vr: 'SQ',
        Value: [{ '00081155': { vr: 'UI', Value: ['kept'] } }, 'unchanged'],
      },
      '00290010': { vr: 'OB', InlineBinary: 'AQID' },
      '00290011': { vr: 'OB', InlineBinary: 'AQID' },
      '00290013': { vr: 'OB' },
    });
  });

  test('converts person names, dates, and times', () => {
    expect(dicomPersonNameToString([{ Alphabetic: ' TEST^PATIENT ' }])).toBe('TEST^PATIENT');
    expect(dicomPersonNameToString([{ Ideographic: 'ignored' }])).toBeUndefined();
    expect(dicomPersonNameToString(undefined)).toBeUndefined();
    expect(stringToDicomPersonName('TEST^PATIENT')).toEqual([{ Alphabetic: 'TEST^PATIENT' }]);
    expect(stringToDicomPersonName(undefined)).toBeUndefined();

    expect(dicomDateToFhirDate('20240102')).toBe('2024-01-02');
    expect(dicomDateToFhirDate('202401')).toBeUndefined();
    expect(fhirDateToDicomDate('2024-01-02')).toBe('20240102');
    expect(fhirDateToDicomDate(undefined)).toBeUndefined();

    expect(dicomTimeToFhirTime('030405.123')).toBe('03:04:05');
    expect(dicomTimeToFhirTime('0304')).toBeUndefined();
    expect(fhirTimeToDicomTime('03:04:05')).toBe('030405');
    expect(fhirTimeToDicomTime(undefined)).toBeUndefined();
  });

  test('drops unparseable dates and times rather than propagating them', () => {
    // Each of these is the right length to be reformatted, so only validating the result rejects
    // them. Propagating "asdf-as-df" instead would fail validation and reject the whole request.
    expect(dicomDateToFhirDate('asdfasdf')).toBeUndefined();
    expect(dicomDateToFhirDate('99999999')).toBeUndefined();
    expect(dicomDateToFhirDate('20241301')).toBeUndefined(); // Month 13
    expect(dicomDateToFhirDate('20240132')).toBeUndefined(); // Day 32
    expect(dicomDateToFhirDate('2024-01-02')).toBeUndefined(); // Already FHIR formatted
    expect(dicomDateToFhirDate(20240102)).toBeUndefined(); // Not a string

    expect(dicomTimeToFhirTime('asdfas')).toBeUndefined();
    expect(dicomTimeToFhirTime('999999')).toBeUndefined();
    expect(dicomTimeToFhirTime('250405')).toBeUndefined(); // Hour 25
    expect(dicomTimeToFhirTime('036005')).toBeUndefined(); // Minute 60
    expect(dicomTimeToFhirTime('asdfasdfasdf')).toBeUndefined(); // Long enough to pass the length check
    expect(dicomTimeToFhirTime(30405)).toBeUndefined(); // Not a string

    // Leap seconds are valid in FHIR time, and midnight must survive the truthiness of no check
    expect(dicomTimeToFhirTime('235960')).toBe('23:59:60');
    expect(dicomTimeToFhirTime('000000')).toBe('00:00:00');
  });

  test('writes multipart related body', async () => {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));

    await writeMultipartRelatedBody(stream, [Buffer.from('one'), Buffer.from('two')], 'boundary');

    expect(Buffer.concat(chunks).toString()).toBe(
      [
        '--boundary',
        'Content-Type: application/dicom',
        '',
        'one',
        '--boundary',
        'Content-Type: application/dicom',
        '',
        'two',
        '--boundary--',
        '',
      ].join('\r\n')
    );
  });

  test('destroys stream when multipart writing fails', async () => {
    const stream = new PassThrough();
    stream.on('error', () => undefined);
    const err = new Error('write failed');
    vi.spyOn(stream, 'write').mockImplementation(() => {
      throw err;
    });

    await expect(writeMultipartRelatedBody(stream, [Buffer.from('one')], 'boundary')).rejects.toThrow('write failed');
    expect(stream.destroyed).toBe(true);
  });
});

describe('DICOM study aggregates', () => {
  const app = express();
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    repo = (await createTestProject({ withRepo: true })).repo;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function createStudy(): Promise<DicomStudy & { id: string }> {
    return repo.createResource<DicomStudy>({ resourceType: 'DicomStudy', studyInstanceUid: randomUUID() });
  }

  async function addSeries(
    study: DicomStudy,
    modality: string | undefined,
    instances: number
  ): Promise<DicomSeries & { id: string }> {
    const series = await repo.createResource<DicomSeries>({
      resourceType: 'DicomSeries',
      study: createReference(study),
      seriesInstanceUid: randomUUID(),
      modality,
    });
    for (let i = 0; i < instances; i++) {
      await repo.createResource<DicomInstance>({
        resourceType: 'DicomInstance',
        study: createReference(study),
        series: createReference(series),
        sopInstanceUid: randomUUID(),
        sopClassUid: '1.2.3',
        raw: { reference: 'Binary/123' },
        metadata: '{}',
      });
    }
    return series;
  }

  test('Unions modalities across a mixed modality study', () =>
    withTestContext(async () => {
      const study = await createStudy();
      await addSeries(study, 'PT', 2);
      await addSeries(study, 'ct', 3); // Normalized to match the CS value below
      await addSeries(study, 'CT', 1); // Duplicate modality, counted once
      await addSeries(study, undefined, 1); // Missing modality is skipped, but the series still counts

      await updateStudyAggregates(repo, study.id);

      expect(await repo.readResource<DicomStudy>('DicomStudy', study.id)).toMatchObject({
        modalitiesInStudy: ['CT', 'PT'],
        numberOfStudyRelatedSeries: 4,
        numberOfStudyRelatedInstances: 7,
      });
    }));

  test('Leaves modalities absent when no series has one', () =>
    withTestContext(async () => {
      const study = await createStudy();
      await addSeries(study, undefined, 1);

      await updateStudyAggregates(repo, study.id);

      const result = await repo.readResource<DicomStudy>('DicomStudy', study.id);
      expect(result.modalitiesInStudy).toBeUndefined();
      expect(result.numberOfStudyRelatedSeries).toBe(1);
    }));

  test('Does not create a new version when the study is already correct', () =>
    withTestContext(async () => {
      const study = await createStudy();
      await addSeries(study, 'CT', 1);

      await updateStudyAggregates(repo, study.id);
      const first = await repo.readResource<DicomStudy>('DicomStudy', study.id);

      await updateStudyAggregates(repo, study.id);
      const second = await repo.readResource<DicomStudy>('DicomStudy', study.id);

      expect(second.meta?.versionId).toBe(first.meta?.versionId);
    }));

  test('Retries when another writer updates the study first', () =>
    withTestContext(async () => {
      const study = await createStudy();
      await addSeries(study, 'CT', 1);

      const updateResource = vi
        .spyOn(repo, 'updateResource')
        .mockRejectedValueOnce(new OperationOutcomeError(preconditionFailed));

      await updateStudyAggregates(repo, study.id);

      expect(updateResource).toHaveBeenCalledTimes(2);
      expect(await repo.readResource<DicomStudy>('DicomStudy', study.id)).toMatchObject({
        modalitiesInStudy: ['CT'],
      });
      updateResource.mockRestore();
    }));

  test('Gives up after repeated conflicts', () =>
    withTestContext(async () => {
      const study = await createStudy();
      await addSeries(study, 'CT', 1);

      const updateResource = vi
        .spyOn(repo, 'updateResource')
        .mockRejectedValue(new OperationOutcomeError(preconditionFailed));

      await expect(updateStudyAggregates(repo, study.id)).resolves.toBeUndefined();

      expect(updateResource).toHaveBeenCalledTimes(3);
      updateResource.mockRestore();
    }));

  test('Rethrows errors that are not conflicts', () =>
    withTestContext(async () => {
      const study = await createStudy();
      await addSeries(study, 'CT', 1);

      const updateResource = vi.spyOn(repo, 'updateResource').mockRejectedValue(new Error('boom'));

      await expect(updateStudyAggregates(repo, study.id)).rejects.toThrow('boom');

      expect(updateResource).toHaveBeenCalledTimes(1);
      updateResource.mockRestore();
    }));

  test('Counts instances per series', () =>
    withTestContext(async () => {
      const study = await createStudy();
      const ct = await addSeries(study, 'CT', 3);
      const pt = await addSeries(study, 'PT', 2);

      await updateSeriesAggregates(repo, ct.id);
      await updateSeriesAggregates(repo, pt.id);

      expect(await repo.readResource<DicomSeries>('DicomSeries', ct.id)).toMatchObject({
        numberOfSeriesRelatedInstances: 3,
      });
      expect(await repo.readResource<DicomSeries>('DicomSeries', pt.id)).toMatchObject({
        numberOfSeriesRelatedInstances: 2,
      });
    }));

  test('Does not create a new version when the series is already correct', () =>
    withTestContext(async () => {
      const study = await createStudy();
      const series = await addSeries(study, 'CT', 2);

      await updateSeriesAggregates(repo, series.id);
      const first = await repo.readResource<DicomSeries>('DicomSeries', series.id);

      await updateSeriesAggregates(repo, series.id);
      const second = await repo.readResource<DicomSeries>('DicomSeries', series.id);

      expect(second.meta?.versionId).toBe(first.meta?.versionId);
    }));

  test('Retries the series update when another writer gets there first', () =>
    withTestContext(async () => {
      const study = await createStudy();
      const series = await addSeries(study, 'CT', 2);

      const updateResource = vi
        .spyOn(repo, 'updateResource')
        .mockRejectedValueOnce(new OperationOutcomeError(preconditionFailed));

      await updateSeriesAggregates(repo, series.id);

      expect(updateResource).toHaveBeenCalledTimes(2);
      expect(await repo.readResource<DicomSeries>('DicomSeries', series.id)).toMatchObject({
        numberOfSeriesRelatedInstances: 2,
      });
      updateResource.mockRestore();
    }));
});

describe('parseQueryInt', () => {
  test('parses valid integers', () => {
    expect(parseQueryInt('123')).toBe(123);
  });

  test('returns undefined for invalid integers', () => {
    expect(parseQueryInt('abc')).toBeUndefined();
    expect(parseQueryInt(undefined)).toBeUndefined();
    expect(parseQueryInt(null)).toBeUndefined();
    expect(parseQueryInt(['123', 'abc'])).toBeUndefined();
  });
});
