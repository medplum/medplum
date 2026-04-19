// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { isObject, isString } from '@medplum/core';
import type { DicomSeries, DicomStudy, Reference } from '@medplum/fhirtypes';
import type { DcmjsDicomDict, DcmjsDicomElement } from 'dcmjs';
import { once } from 'node:events';
import type { PassThrough } from 'node:stream';

export function dcmjsStudyToMedplumStudy(naturalized: Record<string, unknown>): DicomStudy {
  return {
    resourceType: 'DicomStudy',
    studyInstanceUid: naturalized.StudyInstanceUID as string,
    studyId: naturalized.StudyID as string,
    studyDate: dicomDateToFhirDate(naturalized.StudyDate),
    studyTime: dicomTimeToFhirTime(naturalized.StudyTime),
    accessionNumber: naturalized.AccessionNumber as string,
    instanceAvailability: naturalized.InstanceAvailability as string,
    modalitiesInStudy: naturalized.ModalitiesInStudy as string[],
    referringPhysiciansName: naturalized.ReferringPhysiciansName as string,
    timezoneOffsetFromUtc: naturalized.TimezoneOffsetFromUTC as string,
    patientName: dicomPersonNameToString(naturalized.PatientName),
    patientId: naturalized.PatientID as string,
    patientBirthDate: dicomDateToFhirDate(naturalized.PatientBirthDate),
    patientSex: naturalized.PatientSex as string,
    numberOfStudyRelatedSeries: naturalized.NumberOfStudyRelatedSeries as number,
    numberOfStudyRelatedInstances: naturalized.NumberOfStudyRelatedInstances as number,
  };
}

export function medplumStudyToDcmjsStudy(study: DicomStudy): Record<string, unknown> {
  return {
    StudyInstanceUID: study.studyInstanceUid,
    StudyID: study.studyId,
    StudyDate: fhirDateToDicomDate(study.studyDate),
    StudyTime: fhirTimeToDicomTime(study.studyTime),
    AccessionNumber: study.accessionNumber,
    InstanceAvailability: study.instanceAvailability,
    // ModalitiesInStudy: study.modalitiesInStudy,
    ModalitiesInStudy: ['DX'], // TODO: Add support for multiple modalities.
    ReferringPhysicianName: study.referringPhysiciansName,
    TimezoneOffsetFromUTC: study.timezoneOffsetFromUtc,
    PatientName: stringToDicomPersonName(study.patientName),
    PatientID: study.patientId,
    PatientBirthDate: fhirDateToDicomDate(study.patientBirthDate),
    PatientSex: study.patientSex,
    NumberOfStudyRelatedSeries: 1,
    NumberOfStudyRelatedInstances: 1,
    // NumberOfStudyRelatedSeries: study.numberOfStudyRelatedSeries
    //   ? parseInt(study.numberOfStudyRelatedSeries, 10)
    //   : undefined,
    // NumberOfStudyRelatedInstances: study.numberOfStudyRelatedInstances
    //   ? parseInt(study.numberOfStudyRelatedInstances, 10)
    //   : undefined,
  };
}

export function dcmjsSeriesToMedplumSeries(
  study: Reference<DicomStudy>,
  naturalized: Record<string, unknown>
): DicomSeries {
  return {
    resourceType: 'DicomSeries',
    study,
    seriesInstanceUid: naturalized.SeriesInstanceUID as string,
    seriesNumber: naturalized.SeriesNumber?.toString(),
    modality: naturalized.Modality as string,
    seriesDescription: naturalized.SeriesDescription as string,
    timezoneOffsetFromUtc: naturalized.TimezoneOffsetFromUTC as string,
    numberOfSeriesRelatedInstances: naturalized.NumberOfSeriesRelatedInstances as number,
    performedProcedureStepStartDate: naturalized.PerformedProcedureStepStartDate as string,
    performedProcedureStepStartTime: naturalized.PerformedProcedureStepStartTime as string,
  };
}

export function medplumSeriesToDcmjsSeries(study: DicomStudy, series: DicomSeries): Record<string, unknown> {
  return {
    ...medplumStudyToDcmjsStudy(study),
    SeriesInstanceUID: series.seriesInstanceUid,
    SeriesNumber: series.seriesNumber ? parseInt(series.seriesNumber, 10) : undefined,
    Modality: series.modality,
    SeriesDescription: series.seriesDescription,
    TimezoneOffsetFromUTC: series.timezoneOffsetFromUtc,
    // NumberOfSeriesRelatedInstances: series.numberOfSeriesRelatedInstances
    //   ? parseInt(series.numberOfSeriesRelatedInstances, 10)
    //   : undefined,
    NumberOfSeriesRelatedInstances: 1,
    PerformedProcedureStepStartDate: series.performedProcedureStepStartDate,
    PerformedProcedureStepStartTime: series.performedProcedureStepStartTime,
  };
}

const INLINE_BINARY_VRS = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'UN']);
const MAX_INLINE_BINARY_BYTES = 10 * 1024; // 10 KB

function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

function isTypedArrayView(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value);
}

function isPixelDataTag(tag: string): boolean {
  return tag.toUpperCase() === '7FE00010';
}

function isOverlayDataTag(tag: string): boolean {
  // (60xx,3000)
  return /^60[0-9A-F]{2}3000$/i.test(tag);
}

function isGroup0002Tag(tag: string): boolean {
  return /^0002[0-9A-F]{4}$/i.test(tag);
}

function toBase64(value: ArrayBuffer | ArrayBufferView): string {
  if (isArrayBufferLike(value)) {
    return Buffer.from(value).toString('base64');
  }
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
}

function cleanDicomJsonElement(tag: string, element: DcmjsDicomElement): DcmjsDicomElement | undefined {
  if (isGroup0002Tag(tag) || isPixelDataTag(tag) || isOverlayDataTag(tag)) {
    return undefined;
  }

  const result: DcmjsDicomElement = { ...element };

  if (result.vr === 'SQ' && Array.isArray(result.Value)) {
    result.Value = result.Value.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return cleanDicomJsonDict(item as DcmjsDicomDict);
      }
      return item;
    });
    return result;
  }

  if (result.vr && INLINE_BINARY_VRS.has(result.vr) && Array.isArray(result.Value) && result.Value.length > 0) {
    const first = result.Value[0];

    if (isArrayBufferLike(first) || isTypedArrayView(first)) {
      if (first.byteLength > MAX_INLINE_BINARY_BYTES) {
        return undefined;
      }
      delete result.Value;
      result.InlineBinary = toBase64(first);
      return result;
    }

    // Clean up the broken placeholder shape like Value: [ {} ]
    if (first && typeof first === 'object' && !Array.isArray(first) && Object.keys(first).length === 0) {
      delete result.Value;
      return result;
    }
  }

  return result;
}

export function cleanDicomJsonDict(dataset: DcmjsDicomDict): DcmjsDicomDict {
  const out: DcmjsDicomDict = {};

  for (const [tag, element] of Object.entries(dataset)) {
    const fixed = cleanDicomJsonElement(tag, element);
    if (fixed) {
      out[tag] = fixed;
    }
  }

  return out;
}

export function dicomPersonNameToString(dicomPersonName: unknown): string | undefined {
  if (Array.isArray(dicomPersonName) && dicomPersonName.length > 0) {
    const first = dicomPersonName[0];
    if (isObject(first) && isString(first.Alphabetic)) {
      return first.Alphabetic.trim();
    }
  }
  return undefined;
}

export function stringToDicomPersonName(name: string | undefined): { Alphabetic: string }[] | undefined {
  if (name) {
    return [{ Alphabetic: name }];
  }
  return undefined;
}

export function dicomDateToFhirDate(dicomDate: unknown): string | undefined {
  // DICOM date format is YYYYMMDD, while FHIR date format is YYYY-MM-DD
  if (isString(dicomDate) && dicomDate.length === 8) {
    return `${dicomDate.substring(0, 4)}-${dicomDate.substring(4, 6)}-${dicomDate.substring(6, 8)}`;
  }
  return undefined;
}

export function fhirDateToDicomDate(fhirDate: string | undefined): string | undefined {
  // FHIR date format is YYYY-MM-DD, while DICOM date format is YYYYMMDD
  return fhirDate?.replace(/-/g, '');
}

export function dicomTimeToFhirTime(dicomTime: unknown): string | undefined {
  // DICOM time format is HHMMSS, while FHIR time format is HH:MM:SS
  if (isString(dicomTime) && dicomTime.length >= 6) {
    return `${dicomTime.substring(0, 2)}:${dicomTime.substring(2, 4)}:${dicomTime.substring(4, 6)}`;
  }
  return undefined;
}

export function fhirTimeToDicomTime(fhirTime: string | undefined): string | undefined {
  // FHIR time format is HH:MM:SS, while DICOM time format is HHMMSS
  return fhirTime?.replace(/:/g, '');
}

export async function writeMultipartRelatedBody(out: PassThrough, files: Buffer[], boundary: string): Promise<void> {
  try {
    for (const file of files) {
      await writeBuffer(out, Buffer.from(`--${boundary}\r\n`));
      await writeBuffer(out, Buffer.from('Content-Type: application/dicom\r\n'));
      await writeBuffer(out, Buffer.from('\r\n'));
      await writeBuffer(out, file);
      await writeBuffer(out, Buffer.from('\r\n'));
    }
    await writeBuffer(out, Buffer.from(`--${boundary}--\r\n`));
    out.end();
  } catch (err) {
    out.destroy(err as Error);
    throw err;
  }
}

export async function writeBuffer(stream: PassThrough, buffer: Buffer): Promise<void> {
  if (!stream.write(buffer)) {
    await once(stream, 'drain');
  }
}
