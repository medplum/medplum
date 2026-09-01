// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import {
  deepEquals,
  getStatus,
  isObject,
  isString,
  normalizeOperationOutcome,
  Operator,
  validationRegexes,
} from '@medplum/core';
import type { DicomInstance, DicomSeries, DicomStudy, Reference, Resource } from '@medplum/fhirtypes';
import type { DcmjsDicomDict, DcmjsDicomElement } from 'dcmjs';
import { once } from 'node:events';
import type { PassThrough } from 'node:stream';
import type { Repository } from '../fhir/repo';
import { getLogger } from '../logger';

export function dcmjsStudyToMedplumStudy(naturalized: Record<string, unknown>): DicomStudy {
  return {
    resourceType: 'DicomStudy',
    studyInstanceUid: naturalized.StudyInstanceUID as string,
    studyId: naturalized.StudyID as string,
    studyDate: dicomDateToFhirDate(naturalized.StudyDate),
    studyTime: dicomTimeToFhirTime(naturalized.StudyTime),
    accessionNumber: naturalized.AccessionNumber as string,
    instanceAvailability: naturalized.InstanceAvailability as string,
    modalitiesInStudy: toStringArray(naturalized.ModalitiesInStudy),
    referringPhysiciansName: naturalized.ReferringPhysiciansName as string,
    timezoneOffsetFromUtc: naturalized.TimezoneOffsetFromUTC as string,
    patientName: dicomPersonNameToString(naturalized.PatientName),
    patientId: naturalized.PatientID as string,
    patientBirthDate: dicomDateToFhirDate(naturalized.PatientBirthDate),
    patientSex: naturalized.PatientSex as string,
    // NumberOfStudyRelatedSeries/Instances are Q/R query keys the archive computes, so a sender's
    // own values are dropped rather than trusted: a modality that stamps 512 while pushing one
    // instance at a time would otherwise have QIDO report 512 from the first instance onward. The
    // study job fills them in from what is actually stored.
  };
}

function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter(isString);
  }
  if (isString(value)) {
    return [value];
  }
  return undefined;
}

export function medplumStudyToDcmjsStudy(study: DicomStudy): Record<string, unknown> {
  return {
    StudyInstanceUID: study.studyInstanceUid,
    StudyID: study.studyId,
    StudyDate: fhirDateToDicomDate(study.studyDate),
    StudyTime: fhirTimeToDicomTime(study.studyTime),
    AccessionNumber: study.accessionNumber,
    InstanceAvailability: study.instanceAvailability,
    ModalitiesInStudy: study.modalitiesInStudy,
    ReferringPhysicianName: study.referringPhysiciansName,
    TimezoneOffsetFromUTC: study.timezoneOffsetFromUtc,
    PatientName: stringToDicomPersonName(study.patientName),
    PatientID: study.patientId,
    PatientBirthDate: fhirDateToDicomDate(study.patientBirthDate),
    PatientSex: study.patientSex,
    NumberOfStudyRelatedSeries: study.numberOfStudyRelatedSeries,
    NumberOfStudyRelatedInstances: study.numberOfStudyRelatedInstances,
  };
}

/** Attempts at the read-modify-write cycle before giving up, to bound retries against a busy study. */
const MAX_UPDATE_ATTEMPTS = 3;

/**
 * Applies a recomputed version of a resource, retrying when a concurrent writer gets there first.
 *
 * Instances in a single STOW request are stored concurrently, and separate requests can target the
 * same study, so the aggregates below are a genuine read-modify-write race. The write is guarded by
 * `ifMatch`; the loser of a race re-reads after the winner committed, so it always recomputes from
 * strictly fresher data. Two concurrent writers therefore converge after one retry.
 *
 * @param repo - The repository to read and write with.
 * @param resourceType - The resource type to update.
 * @param id - The ID of the resource to update.
 * @param recompute - Returns the updated resource, or undefined when it already holds the right values.
 */
export async function updateWithRetry<T extends Resource>(
  repo: Repository,
  resourceType: T['resourceType'],
  id: string,
  recompute: (existing: WithId<T>) => Promise<T | undefined>
): Promise<void> {
  for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt++) {
    const existing = await repo.readResource<T>(resourceType, id);
    const updated = await recompute(existing);
    if (!updated) {
      return;
    }

    try {
      await repo.updateResource<T>(updated, { ifMatch: existing.meta?.versionId });
      return;
    } catch (err) {
      if (getStatus(normalizeOperationOutcome(err)) !== 412) {
        throw err;
      }
      // Another writer won. Read it back and recompute.
    }
  }

  getLogger().warn('Unable to update derived DICOM resource', { resourceType, id });
}

/**
 * A single consistent read of a study's series and instance counts.
 *
 * Gathered once and reused for the study aggregates, the series aggregates, and the `ImagingStudy`,
 * so those three cannot disagree with each other the way they could if each recomputed its own view.
 */
export interface StudyScan {
  readonly seriesList: WithId<DicomSeries>[];
  readonly instanceCounts: Map<string, number>;
  readonly totalInstances: number;
}

/**
 * Reads every series in a study, plus the instance counts for the study and each series.
 *
 * Instances are counted rather than enumerated: nothing downstream needs the instances themselves,
 * and a large study holds more of them than is reasonable to hold in memory.
 *
 * @param repo - The repository to read with.
 * @param studyId - The ID of the `DicomStudy` to scan.
 * @returns The scan.
 */
export async function scanStudy(repo: Repository, studyId: string): Promise<StudyScan> {
  const studyReference = `DicomStudy/${studyId}`;
  const seriesList: WithId<DicomSeries>[] = [];

  await repo.processAllResources<DicomSeries>(
    {
      resourceType: 'DicomSeries',
      filters: [{ code: 'study', operator: Operator.EQUALS, value: studyReference }],
      // Sorted by _lastUpdated ascending so the search pages by cursor rather than by offset.
      // Offset paging throws past `maxSearchOffset` (default 10,000), which a large study reaches.
      sortRules: [{ code: '_lastUpdated' }],
      count: 1000,
    },
    async (series) => {
      seriesList.push(series);
    }
  );

  const instanceCounts = new Map<string, number>();
  for (const series of seriesList) {
    instanceCounts.set(series.id, await countInstances(repo, 'series', `DicomSeries/${series.id}`));
  }

  return {
    seriesList,
    instanceCounts,
    totalInstances: await countInstances(repo, 'study', studyReference),
  };
}

/**
 * Counts the instances matching one reference search parameter.
 * @param repo - The repository to read with.
 * @param code - The search parameter to filter on.
 * @param value - The reference to match.
 * @returns The instance count.
 */
async function countInstances(repo: Repository, code: string, value: string): Promise<number> {
  const bundle = await repo.search<DicomInstance>({
    resourceType: 'DicomInstance',
    filters: [{ code, operator: Operator.EQUALS, value }],
    count: 0,
    total: 'accurate',
  });
  return bundle.total ?? 0;
}

/**
 * Recomputes the Study level aggregate attributes of a `DicomStudy` from a scan.
 *
 * ModalitiesInStudy (0008,0061), NumberOfStudyRelatedSeries (0020,1206), and
 * NumberOfStudyRelatedInstances (0020,1208) are Study level query keys that the archive computes
 * (PS3.4 C.6.2.1.2). They belong to no composite IOD, so stored instances almost never carry them,
 * and a sender that does include them is describing its own view of the study rather than ours.
 *
 * Computing from the stored series - rather than appending the modality of whatever instance just
 * arrived - keeps this idempotent, so a retry, a re-upload, or an upload following a partial failure
 * all converge on the same answer.
 *
 * @param repo - The repository to read and write with.
 * @param studyId - The ID of the `DicomStudy` to update.
 * @param scan - The scan to compute from.
 */
export async function updateStudyAggregates(repo: Repository, studyId: string, scan: StudyScan): Promise<void> {
  await updateWithRetry<DicomStudy>(repo, 'DicomStudy', studyId, async (study) => {
    const modalities = new Set<string>();
    for (const series of scan.seriesList) {
      const modality = series.modality?.trim().toUpperCase();
      if (modality) {
        modalities.add(modality);
      }
    }

    // Sorted so that an unchanged study compares equal below, rather than churning a new version.
    const modalitiesInStudy =
      modalities.size > 0 ? Array.from(modalities).sort((a, b) => a.localeCompare(b)) : undefined;

    if (
      deepEquals(study.modalitiesInStudy, modalitiesInStudy) &&
      study.numberOfStudyRelatedSeries === scan.seriesList.length &&
      study.numberOfStudyRelatedInstances === scan.totalInstances
    ) {
      return undefined;
    }

    return {
      ...study,
      modalitiesInStudy,
      numberOfStudyRelatedSeries: scan.seriesList.length,
      numberOfStudyRelatedInstances: scan.totalInstances,
    };
  });
}

/**
 * Recomputes NumberOfSeriesRelatedInstances (0020,1209) for every series in a scan.
 *
 * Another Q/R query key absent from the composite IOD, for the same reasons described on
 * {@link updateStudyAggregates}. Every series in the study is recomputed rather than only the ones a
 * request touched, because a coalesced study job cannot know which instances arrived since it last
 * ran. Series whose count is unchanged return early without a write.
 *
 * @param repo - The repository to read and write with.
 * @param scan - The scan to compute from.
 */
export async function updateSeriesAggregates(repo: Repository, scan: StudyScan): Promise<void> {
  for (const series of scan.seriesList) {
    const count = scan.instanceCounts.get(series.id) ?? 0;
    await updateWithRetry<DicomSeries>(repo, 'DicomSeries', series.id, async (existing) =>
      existing.numberOfSeriesRelatedInstances === count
        ? undefined
        : { ...existing, numberOfSeriesRelatedInstances: count }
    );
  }
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
    // Recomputed by the DICOM study job, not taken from the sender. See dcmjsStudyToMedplumStudy.
    performedProcedureStepStartDate: dicomDateToFhirDate(naturalized.PerformedProcedureStepStartDate),
    performedProcedureStepStartTime: dicomTimeToFhirTime(naturalized.PerformedProcedureStepStartTime),
  };
}

export function medplumSeriesToDcmjsSeries(study: DicomStudy, series: DicomSeries): Record<string, unknown> {
  return {
    ...medplumStudyToDcmjsStudy(study),
    SeriesInstanceUID: series.seriesInstanceUid,
    SeriesNumber: series.seriesNumber ? Number.parseInt(series.seriesNumber, 10) : undefined,
    Modality: series.modality,
    SeriesDescription: series.seriesDescription,
    TimezoneOffsetFromUTC: series.timezoneOffsetFromUtc,
    NumberOfSeriesRelatedInstances: series.numberOfSeriesRelatedInstances,
    PerformedProcedureStepStartDate: fhirDateToDicomDate(series.performedProcedureStepStartDate),
    PerformedProcedureStepStartTime: fhirTimeToDicomTime(series.performedProcedureStepStartTime),
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
    const fhirDate = `${dicomDate.substring(0, 4)}-${dicomDate.substring(4, 6)}-${dicomDate.substring(6, 8)}`;
    // Reformatting alone would turn "asdfasdf" into "asdf-as-df", which fails validation and would
    // reject the whole request. Dropping an unparseable optional attribute keeps the study storable.
    if (validationRegexes.date.test(fhirDate)) {
      return fhirDate;
    }
  }
  return undefined;
}

export function fhirDateToDicomDate(fhirDate: string | undefined): string | undefined {
  // FHIR date format is YYYY-MM-DD, while DICOM date format is YYYYMMDD
  return fhirDate?.replaceAll('-', '');
}

export function dicomTimeToFhirTime(dicomTime: unknown): string | undefined {
  // DICOM time format is HHMMSS, optionally followed by fractional seconds, while FHIR time format is HH:MM:SS
  if (isString(dicomTime) && dicomTime.length >= 6) {
    const fhirTime = `${dicomTime.substring(0, 2)}:${dicomTime.substring(2, 4)}:${dicomTime.substring(4, 6)}`;
    // Dropped rather than propagated when invalid, for the reason given in dicomDateToFhirDate
    if (validationRegexes.time.test(fhirTime)) {
      return fhirTime;
    }
  }
  return undefined;
}

export function fhirTimeToDicomTime(fhirTime: string | undefined): string | undefined {
  // FHIR time format is HH:MM:SS, while DICOM time format is HHMMSS
  return fhirTime?.replaceAll(':', '');
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

/**
 * Parses a QIDO-RS paging query parameter (`limit` or `offset`) into a non-negative integer.
 *
 * Returns undefined when the parameter is absent or invalid, so the caller falls back to the
 * server's default page size. The server clamps `count` to its own maximum (1000).
 *
 * @param value - The raw query parameter value from the request.
 * @returns The parsed non-negative integer, or undefined if absent/invalid.
 */
export function parseQueryInt(value: unknown): number | undefined {
  if (!isString(value)) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? undefined : parsed;
}
