// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import { createReference, deepEquals, HTTP_HL7_ORG, isCreated, Operator } from '@medplum/core';
import type {
  Coding,
  Device,
  DicomSeries,
  DicomStudy,
  Endpoint,
  Group,
  ImagingStudy,
  ImagingStudySeries,
  Meta,
  Patient,
  Reference,
} from '@medplum/fhirtypes';
import { getConfig } from '../config/loader';
import type { Repository } from '../fhir/repo';
import { getLogger } from '../logger';
import { updateWithRetry } from './utils';

export const DICOM_UID_SYSTEM = 'urn:dicom:uid';
const DCM_SYSTEM = 'http://dicom.nema.org/resources/ontology/DCM';
const ENDPOINT_CONNECTION_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/endpoint-connection-type';
const MEDPLUM_DICOM_SYSTEM = 'https://medplum.com/dicom';

/** Marks the resources this module maintains, so `ImagingStudy?_tag=` can find them. */
const DERIVED_TAG: Coding = { system: MEDPLUM_DICOM_SYSTEM, code: 'derived-from-dicom' };

/**
 * Stated for a series whose `DicomSeries.modality` is missing.
 *
 * Modality (0008,0060) is Type 1 in every image IOD, so its absence means a malformed sender rather
 * than a study with genuinely no modality. `ImagingStudy.series.modality` is required, so it cannot
 * simply be dropped the way `dicomDateToFhirDate` drops an unparseable date; this states the absence
 * instead of asserting a code - such as DCM "OT" - that no instance actually carried.
 */
const UNKNOWN_MODALITY: Coding = {
  extension: [{ url: `${HTTP_HL7_ORG}/fhir/StructureDefinition/data-absent-reason`, valueCode: 'unknown' }],
};

/**
 * The `ImagingStudy` elements this module owns.
 *
 * Everything absent from this list belongs to whoever wrote it - a human correcting the chart, or a
 * Bot linking the study to an order - and survives by construction, because the merge spreads the
 * stored resource first and overlays only these keys.
 */
type DerivedKey =
  | 'identifier'
  | 'status'
  | 'modality'
  | 'subject'
  | 'started'
  | 'endpoint'
  | 'numberOfSeries'
  | 'numberOfInstances'
  | 'series';

/**
 * Every derived key must be produced on every run, even when the answer is `undefined`.
 *
 * The `-?` is what makes convergence structural: a field that no longer has a value must be spelled
 * `modality: undefined`, so the spread clears it rather than letting a stale server-written value
 * survive because someone forgot to null it out.
 */
type DerivedImagingStudy = { [K in DerivedKey]-?: ImagingStudy[K] };

/** A status someone set by hand to retire a study, which no arriving instance should undo. */
const RETIRED_STATUSES: ImagingStudy['status'][] = ['cancelled', 'entered-in-error'];

export interface StudyScan {
  readonly seriesList: WithId<DicomSeries>[];
  readonly instanceCounts: Map<string, number>;
  readonly totalInstances: number;
}

/**
 * Creates or refreshes the `ImagingStudy` mirroring a `DicomStudy`.
 *
 * `DicomStudy`/`DicomSeries`/`DicomInstance` are the archive's own representation, reachable only
 * through DICOMweb. `ImagingStudy` is how the rest of a FHIR server finds imaging: what a
 * `DiagnosticReport` cites, what a search by patient returns. Deriving it here means a DICOMweb STOW
 * and a directly created `DicomInstance` produce the same chart-visible study.
 *
 * Instances are deliberately not enumerated into `series.instance`. Viewers read them from
 * `GET .../series/{uid}/metadata` instead, and indexing every SOP instance UID would rewrite tens of
 * thousands of token rows on each recompute for no consumer.
 *
 * @param repo - The repository to read and write with, scoped to the study's project.
 * @param study - The study to mirror.
 * @param scan - Series and instance counts already gathered for the aggregate pass.
 */
export async function reconcileImagingStudy(
  repo: Repository,
  study: WithId<DicomStudy>,
  scan: StudyScan
): Promise<void> {
  const projectId = study.meta?.project;
  if (!projectId) {
    getLogger().warn('Skipping ImagingStudy for a DicomStudy with no project', { studyId: study.id });
    return;
  }

  const search: SearchRequest<ImagingStudy> = {
    resourceType: 'ImagingStudy',
    filters: [
      { code: '_project', operator: Operator.EQUALS, value: projectId },
      {
        code: 'identifier',
        operator: Operator.EXACT,
        value: `${DICOM_UID_SYSTEM}|urn:oid:${study.studyInstanceUid}`,
      },
    ],
  };

  const matches = await repo.searchResources<ImagingStudy>({ ...search, count: 2 });
  if (matches.length > 1) {
    // Two resources claim one Study Instance UID. Choosing between them could strip a chart link,
    // so leave both alone and surface it rather than guessing.
    getLogger().error('Multiple ImagingStudy resources for one DICOM study', {
      studyId: study.id,
      studyInstanceUid: study.studyInstanceUid,
    });
    return;
  }

  const endpoint = await getWadoEndpoint(repo, projectId);
  const existing = matches[0];

  if (!existing) {
    const derived = await deriveImagingStudy(repo, projectId, study, scan, endpoint, undefined);
    const result = await repo.conditionalCreate<ImagingStudy>(mergeImagingStudy(undefined, derived, projectId), search);
    if (isCreated(result.outcome)) {
      return;
    }
    // Another worker created it between the search and the create; fall through onto theirs.
  }

  const id = existing?.id ?? (await repo.searchResources<ImagingStudy>({ ...search, count: 1 }))[0]?.id;
  if (!id) {
    return;
  }

  await updateWithRetry<ImagingStudy>(repo, 'ImagingStudy', id, async (current) => {
    const derived = await deriveImagingStudy(repo, projectId, study, scan, endpoint, current);
    const merged = mergeImagingStudy(current, derived, projectId);
    // Skip the write when nothing changed: every version writes a full history row and dispatches to
    // every matching Subscription, and this runs again for each instance that arrives.
    return deepEquals(current, merged) ? undefined : merged;
  });
}

/**
 * Builds the server-owned projection of a study.
 * @param repo - The repository to resolve the subject with.
 * @param projectId - The project the study belongs to.
 * @param study - The source study.
 * @param scan - Series and instance counts.
 * @param endpoint - The project's WADO-RS endpoint.
 * @param existing - The stored ImagingStudy, if any, for the fields that latch.
 * @returns The derived fields.
 */
async function deriveImagingStudy(
  repo: Repository,
  projectId: string,
  study: WithId<DicomStudy>,
  scan: StudyScan,
  endpoint: Reference<Endpoint>,
  existing: ImagingStudy | undefined
): Promise<DerivedImagingStudy> {
  const modalities = new Set<string>();
  const series: ImagingStudySeries[] = [];

  for (const dicomSeries of scan.seriesList) {
    const modality = dicomSeries.modality?.trim().toUpperCase();
    if (modality) {
      modalities.add(modality);
    }
    series.push({
      uid: dicomSeries.seriesInstanceUid,
      number: toUnsignedInt(dicomSeries.seriesNumber),
      modality: modality ? { system: DCM_SYSTEM, code: modality } : UNKNOWN_MODALITY,
      description: dicomSeries.seriesDescription,
      numberOfInstances: scan.instanceCounts.get(dicomSeries.id) ?? 0,
      started: toFhirDateTime(
        dicomSeries.performedProcedureStepStartDate,
        dicomSeries.performedProcedureStepStartTime,
        dicomSeries.timezoneOffsetFromUtc
      ),
    });
  }

  // Sorted so an unchanged study compares equal below. Search paging gives no ordering guarantee
  // across pages, and deepEquals compares arrays positionally, so an unsorted list would churn a new
  // version - and a fresh round of subscription dispatches - on every single run.
  series.sort(compareByNumberThenUid);

  return {
    identifier: mergeSlot(
      existing?.identifier,
      [{ system: DICOM_UID_SYSTEM, value: `urn:oid:${study.studyInstanceUid}` }],
      (identifier) => identifier.system === DICOM_UID_SYSTEM
    ),
    status: resolveStatus(existing, scan.totalInstances),
    modality: Array.from(modalities)
      .sort((a, b) => a.localeCompare(b))
      .map((code) => ({ system: DCM_SYSTEM, code })),
    subject: await resolveSubject(repo, projectId, study, existing?.subject),
    started: toFhirDateTime(study.studyDate, study.studyTime, study.timezoneOffsetFromUtc),
    endpoint: mergeSlot(existing?.endpoint, [endpoint], (value) => value.reference === endpoint.reference),
    numberOfSeries: series.length,
    numberOfInstances: scan.totalInstances,
    series: series.length > 0 ? series : undefined,
  };
}

/**
 * Overlays the derived fields onto the stored resource.
 * @param existing - The stored resource, if any.
 * @param derived - The server-owned projection.
 * @param projectId - The project the study belongs to.
 * @returns The resource to write.
 */
function mergeImagingStudy(
  existing: ImagingStudy | undefined,
  derived: DerivedImagingStudy,
  projectId: string
): ImagingStudy {
  const meta: Meta = {
    ...existing?.meta,
    project: projectId,
    tag: mergeSlot(existing?.meta?.tag, [DERIVED_TAG], (tag) => tag.system === MEDPLUM_DICOM_SYSTEM),
  };
  // Spreading `existing` first is what preserves caller-owned fields - basedOn, encounter, note,
  // procedureReference - without this module having to enumerate them.
  return { ...existing, ...derived, resourceType: 'ImagingStudy', meta };
}

/**
 * Replaces the entries this module owns, preserving every other entry and its order.
 * @param existing - The stored array.
 * @param derived - The entries this module contributes.
 * @param owns - Identifies an entry this module wrote.
 * @returns The merged array, or undefined when empty.
 */
function mergeSlot<T>(existing: T[] | undefined, derived: T[], owns: (value: T) => boolean): T[] | undefined {
  const merged = [...derived, ...(existing?.filter((value) => !owns(value)) ?? [])];
  return merged.length > 0 ? merged : undefined;
}

/**
 * Resolves `ImagingStudy.subject`, upgrading a logical reference to a literal one but never the reverse.
 *
 * A stored literal reference is a statement someone made about identity - an earlier run that
 * matched, or a human correcting a study we could not match. DICOM cannot outrank it: a `patientId`
 * that failed to resolve once will keep failing, so re-deriving on every arriving instance would undo
 * that correction over and over. Downgrading is not a decision made here; it is unreachable, because
 * the only transition this performs is logical to literal.
 *
 * @param repo - The repository to search with.
 * @param projectId - The project to confine the search to.
 * @param study - The source study.
 * @param existing - The stored subject, if any.
 * @returns The subject reference.
 */
async function resolveSubject(
  repo: Repository,
  projectId: string,
  study: DicomStudy,
  existing: Reference<Patient | Device | Group> | undefined
): Promise<Reference<Patient | Device | Group>> {
  if (existing?.reference) {
    return existing;
  }

  const patientId = study.patientId?.trim();
  if (patientId) {
    // _project is required, not hardening: the study job runs on a system repository, which has no
    // project of its own and would otherwise match a Patient in another tenant that happens to share
    // an MRN. `count: 2` so an ambiguous match is detected rather than silently taking the first.
    const matches = await repo.searchResources<Patient>({
      resourceType: 'Patient',
      filters: [
        { code: '_project', operator: Operator.EQUALS, value: projectId },
        { code: 'identifier', operator: Operator.EXACT, value: patientId },
      ],
      count: 2,
    });
    if (matches.length === 1) {
      return createReference(matches[0]);
    }
  }

  if (!patientId && !study.patientName) {
    // PatientID and PatientName are both Type 2 and may legitimately be empty for an unidentified
    // study, but subject is required, so state the absence rather than write an empty reference.
    return { extension: UNKNOWN_MODALITY.extension };
  }

  return { identifier: patientId ? { value: patientId } : undefined, display: study.patientName };
}

/**
 * Resolves `ImagingStudy.status`.
 * @param existing - The stored resource, if any.
 * @param totalInstances - Instances stored for the study.
 * @returns The status to write.
 */
function resolveStatus(existing: ImagingStudy | undefined, totalInstances: number): ImagingStudy['status'] {
  // A study someone retired is not resurrected by the next instance to arrive.
  if (existing && RETIRED_STATUSES.includes(existing.status)) {
    return existing.status;
  }
  return totalInstances > 0 ? 'available' : 'registered';
}

/**
 * Returns the project's WADO-RS endpoint, creating it on first use.
 *
 * Matched on an identifier this server owns rather than on `connection-type`, so a `dicom-wado-rs`
 * Endpoint the customer created for their own archive is never adopted and rewritten.
 *
 * @param repo - The repository to read and write with.
 * @param projectId - The project the endpoint belongs to.
 * @returns A reference to the endpoint.
 */
export async function getWadoEndpoint(repo: Repository, projectId: string): Promise<Reference<Endpoint>> {
  const result = await repo.conditionalCreate<Endpoint>(
    {
      resourceType: 'Endpoint',
      meta: { project: projectId },
      identifier: [{ system: MEDPLUM_DICOM_SYSTEM, value: 'wado-rs' }],
      status: 'active',
      connectionType: { system: ENDPOINT_CONNECTION_TYPE_SYSTEM, code: 'dicom-wado-rs' },
      name: 'DICOMweb WADO-RS',
      payloadType: [
        { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/endpoint-payload-type', code: 'any' }] },
      ],
      payloadMimeType: ['application/dicom'],
      address: new URL('dicomweb', getConfig().baseUrl).toString(),
    },
    {
      resourceType: 'Endpoint',
      filters: [
        { code: '_project', operator: Operator.EQUALS, value: projectId },
        { code: 'identifier', operator: Operator.EXACT, value: `${MEDPLUM_DICOM_SYSTEM}|wado-rs` },
      ],
    }
  );
  return createReference(result.resource);
}

/**
 * Orders series by DICOM series number, falling back to UID.
 * @param a - The first series.
 * @param b - The second series.
 * @returns The sort order.
 */
function compareByNumberThenUid(a: ImagingStudySeries, b: ImagingStudySeries): number {
  const aNumber = a.number ?? Number.MAX_SAFE_INTEGER;
  const bNumber = b.number ?? Number.MAX_SAFE_INTEGER;
  return aNumber === bNumber ? a.uid.localeCompare(b.uid) : aNumber - bNumber;
}

/**
 * Parses a DICOM Integer String into an `unsignedInt`.
 * @param value - The string value, which callers may have set to anything.
 * @returns The parsed number, or undefined if it is not a non-negative integer.
 */
function toUnsignedInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Combines a DICOM date, time, and UTC offset into a FHIR dateTime.
 *
 * Emits date-only unless both the time and the offset are known: FHIR requires a timezone whenever a
 * time is present, and DICOM times are local wall time carrying no offset of their own, so inventing
 * `Z` would move the study by up to twelve hours.
 *
 * @param date - The FHIR-normalized date.
 * @param time - The FHIR-normalized time.
 * @param offset - TimezoneOffsetFromUTC (0008,0201), as `&plusmn;HHMM`.
 * @returns The dateTime, or undefined when there is no date.
 */
function toFhirDateTime(
  date: string | undefined,
  time: string | undefined,
  offset: string | undefined
): string | undefined {
  if (!date) {
    return undefined;
  }
  if (!time || !offset || !/^[+-]\d{4}$/.test(offset)) {
    return date;
  }
  return `${date}T${time}${offset.slice(0, 3)}:${offset.slice(3)}`;
}
