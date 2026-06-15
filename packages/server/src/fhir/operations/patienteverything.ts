// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import {
  allOk,
  append,
  concatUrls,
  flatMapFilter,
  getReferenceString,
  isReference,
  isResource,
  Operator,
  sortStringArray,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  Attachment,
  Binary,
  Bundle,
  BundleEntry,
  BundleLink,
  CompartmentDefinitionResource,
  DocumentReference,
  DocumentReferenceContent,
  Patient,
  Reference,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import type { Readable } from 'node:stream';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { getBinaryStorage } from '../../storage/loader';
import { getPatientCompartments } from '../patient';
import type { Repository } from '../repo';
import { normalizeBinaryUrl } from '../rewrite';
import { getOperationDefinition } from './definitions';
import { filterByCareDate } from './utils/caredate';
import { parseInputParameters } from './utils/parameters';

const operation = getOperationDefinition('Patient', 'everything');

const defaultMaxResults = 1000;

export interface PatientEverythingParameters {
  start?: string;
  end?: string;
  _since?: string;
  _count?: number;
  _offset?: number;
  _type?: ResourceType[] | string;
  _inlineAttachments?: boolean;
}

// Patient everything operation.
// https://hl7.org/fhir/operation-patient-everything.html

/**
 * Handles a Patient everything request.
 * Searches for all resources related to the patient.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function patientEverythingHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;
  const params = parseInputParameters<PatientEverythingParameters>(operation, req);

  // _inlineAttachments is a Medplum extension not in the standard OperationDefinition.
  params._inlineAttachments = isPatientEverythingInlineAttachmentsEnabled(req, ctx.repo);

  // First read the patient to verify access
  const patient = await ctx.repo.readResource<Patient>('Patient', id);

  // Then read all of the patient data
  const bundle = await getPatientEverything(ctx.repo, patient, params);

  return [allOk, bundle];
}

/**
 * Executes the Patient $everything operation.
 * Searches for all resources related to the patient.
 * @param repo - The repository.
 * @param patient - The root patient.
 * @param params - The operation input parameters.
 * @returns The patient everything search result bundle.
 */
export async function getPatientEverything(
  repo: Repository,
  patient: WithId<Patient>,
  params?: PatientEverythingParameters
): Promise<Bundle<WithId<Resource>>> {
  const types = normalizeTypes(params?._type);

  // First get all compartment resources
  const search: Partial<SearchRequest> = {
    types: types.length > 0 ? types : undefined,
    count: params?._count,
    offset: params?._offset,
  };
  if (params?._since) {
    search.filters = append(search.filters, {
      code: '_lastUpdated',
      operator: Operator.GREATER_THAN_OR_EQUALS,
      value: params._since,
    });
  }
  const bundle = await searchPatientCompartment(repo, patient, search);
  rewritePatientEverythingLinks(bundle, patient, params);

  // Filter by requested date range
  filterByCareDate(bundle, params?.start, params?.end);

  // Recursively resolve references to resources not in the official compartment, but
  // which should be included for completeness
  await addResolvedReferences(repo, bundle.entry);
  bundle.entry = removeDuplicateEntries(bundle.entry);

  if (params?._inlineAttachments) {
    await inlineDocumentReferenceAttachments(repo, bundle.entry, getConfig().inlineAttachmentsMaxTotalBytes);
  }

  return bundle;
}

function rewritePatientEverythingLinks(
  bundle: Bundle<WithId<Resource>>,
  patient: WithId<Patient>,
  params: PatientEverythingParameters | undefined
): void {
  if (!bundle.link?.length) {
    return;
  }

  bundle.link = bundle.link.map((link) => rewritePatientEverythingLink(link, patient, params));
}

function rewritePatientEverythingLink(
  link: BundleLink,
  patient: WithId<Patient>,
  params: PatientEverythingParameters | undefined
): BundleLink {
  const searchUrl = new URL(link.url);
  const url = new URL(concatUrls(getConfig().baseUrl, `/fhir/R4/Patient/${patient.id}/$everything`));

  setSearchParam(url, 'start', params?.start);
  setSearchParam(url, 'end', params?.end);
  setSearchParam(url, '_since', params?._since);
  setSearchParam(url, '_count', searchUrl.searchParams.get('_count') ?? params?._count);
  setSearchParam(url, '_offset', searchUrl.searchParams.get('_offset'));

  const types = normalizeTypes(params?._type);
  if (types.length > 0) {
    url.searchParams.set('_type', types.join(','));
  }

  if (params?._inlineAttachments !== undefined) {
    url.searchParams.set('_inlineAttachments', String(params._inlineAttachments));
  }

  return { ...link, url: url.toString() };
}

function setSearchParam(url: URL, name: string, value: string | number | undefined | null): void {
  if (value !== undefined && value !== null && value !== '') {
    url.searchParams.set(name, String(value));
  }
}

function normalizeTypes(types: PatientEverythingParameters['_type']): ResourceType[] {
  if (!types) {
    return [];
  }
  const values = Array.isArray(types) ? types : [types];
  return flatMapFilter(values, (type) => type.split(',').filter(Boolean) as ResourceType[]);
}

function isPatientEverythingInlineAttachmentsEnabled(req: FhirRequest, repo: Repository): boolean {
  if (req.query?.['_inlineAttachments'] !== undefined) {
    return req.query['_inlineAttachments'] === 'true';
  }
  return (
    repo.currentProject()?.setting?.find((s) => s.name === 'patientEverythingInlineAttachments')?.valueBoolean === true
  );
}

export async function searchPatientCompartment(
  repo: Repository,
  target: WithId<Resource>,
  search?: Partial<SearchRequest>
): Promise<Bundle<WithId<Resource>>> {
  const resourceList = getPatientCompartments().resource as CompartmentDefinitionResource[];
  const types = search?.types ?? flatMapFilter(resourceList, (r) => (r.code === 'Binary' ? undefined : r.code));
  types.push(target.resourceType);
  sortStringArray(types);

  const filters = search?.filters ?? [];
  filters.push({
    code: '_compartment',
    operator: Operator.EQUALS,
    value: getReferenceString(target),
  });

  // Get initial bundle of compartment resources
  return repo.search({
    resourceType: target.resourceType,
    types,
    filters,
    count: search?.count ?? defaultMaxResults,
    offset: search?.offset,
    sortRules: [{ code: '_id' }], // Must make sort deterministic to ensure that pagination works correctly
  });
}

/**
 * Recursively resolves references in the given resources.
 * @param repo - The repository.
 * @param entries - The initial resources to process.
 */
async function addResolvedReferences(repo: Repository, entries: BundleEntry[] | undefined): Promise<void> {
  const processedRefs = new Set<string>();
  let page = entries;
  while (page?.length) {
    const references = processReferencesFromResources(page, processedRefs);
    const resolved = await repo.readReferences(references);
    page = flatMapFilter(resolved, (resource) =>
      isResource(resource) ? { resource, search: { mode: 'include' } } : undefined
    );
    entries?.push(...page);
  }
}

function processReferencesFromResources(toProcess: BundleEntry[], processedRefs: Set<string>): Reference[] {
  const references = new Set<string>();
  for (const entry of toProcess) {
    const resource = entry.resource as WithId<Resource>;
    const refString = getReferenceString(resource);
    if (processedRefs.has(refString)) {
      continue;
    } else {
      processedRefs.add(refString);
    }

    // Find all references in the resource
    const candidateRefs = collectReferences(resource);
    for (const reference of candidateRefs) {
      if (!processedRefs.has(reference) && shouldResolveReference(reference)) {
        references.add(reference);
      }
    }
  }

  const result: Reference[] = [];
  for (const reference of references) {
    result.push({ reference });
  }
  return result;
}

// Most relevant resource types are already included in the Patient compartment, so
// only references of select other types need to be resolved
const allowedReferenceTypes = /^(Organization|Location|Practitioner|PractitionerRole|Medication|Device)\//;
function shouldResolveReference(refString: string): boolean {
  return allowedReferenceTypes.test(refString);
}

function collectReferences(resource: any, foundReferences = new Set<string>()): Set<string> {
  for (const key in resource) {
    if (resource[key] && typeof resource[key] === 'object') {
      const value = resource[key];
      if (isReference(value)) {
        foundReferences.add(value.reference);
      } else {
        collectReferences(value, foundReferences);
      }
    }
  }
  return foundReferences;
}

/**
 * For each DocumentReference in the bundle, replaces attachment URLs pointing to Binary storage
 * with inline base64-encoded data. This transforms `attachment.url` into `attachment.data`.
 * @param repo - The repository for reading Binary resources.
 * @param entries - The bundle entries to process.
 * @param maxBytes - Max total size of attachments to inline
 */
async function inlineDocumentReferenceAttachments(
  repo: Repository,
  entries: BundleEntry[] | undefined,
  maxBytes: number
): Promise<void> {
  let totalBytes = 0;
  let inlinedCount = 0;
  let skippedCount = 0;
  for (const entry of entries ?? []) {
    const resource = entry.resource;
    if (resource?.resourceType !== 'DocumentReference') {
      continue;
    }
    const docRef = resource as WithId<DocumentReference>;
    for (const content of docRef.content ?? []) {
      const binaryAttachment = getBinaryAttachmentToInline(content);
      if (!binaryAttachment) {
        continue;
      }
      const { attachment, id, versionId } = binaryAttachment;
      const remainingBytes = maxBytes - totalBytes;
      if (remainingBytes <= 0) {
        skippedCount++;
        continue;
      }
      try {
        const binary = await readBinaryAttachmentResource(repo, id, versionId);
        const stream = await getBinaryStorage().readBinary(binary);
        const buffer = await readStreamToBufferWithLimit(stream, remainingBytes);
        if (!buffer) {
          skippedCount++;
          getLogger().debug('Skipping attachment inline: exceeds remaining inline attachment budget', {
            binaryId: id,
            remainingBytes,
            maxBytes,
          });
          // Leave attachment.url untouched when the Binary exceeds the inline limit.
          continue;
        }
        attachment.data = buffer.toString('base64');
        if (!attachment.contentType && binary.contentType) {
          attachment.contentType = binary.contentType;
        }
        delete attachment.url;
        totalBytes += buffer.length;
        inlinedCount++;
      } catch (err) {
        skippedCount++;
        getLogger().debug('Error inlining DocumentReference attachment', { error: err });
      }
    }
  }
  getLogger().debug('Finished inlining DocumentReference attachments', { inlinedCount, skippedCount, totalBytes });
}

export function getBinaryAttachmentToInline(
  content: DocumentReferenceContent
): { attachment: Attachment; id: string; versionId?: string } | undefined {
  const attachment = content.attachment;
  if (!attachment.url) {
    return undefined;
  }
  const { id, versionId } = normalizeBinaryUrl(attachment.url);
  return id ? { attachment, id, versionId } : undefined;
}

export async function readBinaryAttachmentResource(
  repo: Pick<Repository, 'readResource' | 'readVersion'>,
  id: string,
  versionId?: string
): Promise<Binary> {
  if (versionId) {
    return repo.readVersion<Binary>('Binary', id, versionId);
  }
  return repo.readResource<Binary>('Binary', id);
}

/**
 * Reads a stream into a Buffer, aborting and returning undefined if the total byte count exceeds maxBytes.
 * @param stream - binary input stream
 * @param maxBytes - Max size for attachment to inline
 * @returns Buffered binary stream
 */
export async function readStreamToBufferWithLimit(stream: Readable, maxBytes: number): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      stream.destroy();
      return undefined;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/**
 * Removes duplicate entries from the given list of bundle entries.
 * @param entries - The bundle entries.
 * @returns The deduplicated bundle entries.
 */
function removeDuplicateEntries(entries: Bundle<WithId<Resource>>['entry']): Bundle<WithId<Resource>>['entry'] {
  const seen = new Set<string>();
  return entries?.filter((entry) => {
    const resource = entry.resource as WithId<Resource>;
    const ref = getReferenceString(resource);
    if (seen.has(ref)) {
      return false;
    } else {
      seen.add(ref);
      return true;
    }
  });
}
