// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { DcmjsDicomDict } from 'dcmjs';
import { PassThrough } from 'node:stream';
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
  stringToDicomPersonName,
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
      })
    ).toMatchObject({
      StudyInstanceUID: 'study-uid',
      StudyID: 'study-id',
      StudyDate: '20240102',
      StudyTime: '030405',
      AccessionNumber: 'A123',
      ModalitiesInStudy: ['DX'],
      PatientName: [{ Alphabetic: 'TEST^PATIENT' }],
      PatientBirthDate: '20000101',
      NumberOfStudyRelatedSeries: 1,
      NumberOfStudyRelatedInstances: 1,
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
    });

    expect(
      medplumSeriesToDcmjsSeries(study, {
        resourceType: 'DicomSeries',
        study: studyRef,
        seriesInstanceUid: 'series-uid',
        seriesNumber: '7',
        modality: 'CT',
        seriesDescription: 'Head CT',
      })
    ).toMatchObject({
      StudyInstanceUID: 'study-uid',
      SeriesInstanceUID: 'series-uid',
      SeriesNumber: 7,
      Modality: 'CT',
      NumberOfSeriesRelatedInstances: 1,
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
    jest.spyOn(stream, 'write').mockImplementation(() => {
      throw err;
    });

    await expect(writeMultipartRelatedBody(stream, [Buffer.from('one')], 'boundary')).rejects.toThrow('write failed');
    expect(stream.destroyed).toBe(true);
  });
});
