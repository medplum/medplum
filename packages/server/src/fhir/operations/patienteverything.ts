// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import {
  allOk,
  append,
  flatMapFilter,
  getReferenceString,
  isReference,
  isResource,
  Operator,
  sortStringArray,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  Binary,
  Bundle,
  BundleEntry,
  CompartmentDefinitionResource,
  DocumentReference,
  Patient,
  Reference,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import type { Readable } from 'node:stream';
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
  _type?: ResourceType[];
  _inlineAttachments?: boolean;
  _maxAttachmentSize?: number;
}

export const DEFAULT_MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

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

  // _inlineAttachments and _maxAttachmentSize are Medplum extensions not in the standard OperationDefinition
  if (req.query?.['_inlineAttachments'] === 'true') {
    params._inlineAttachments = true;
  }
  const maxSizeParam = req.query?.['_maxAttachmentSize'];
  if (typeof maxSizeParam === 'string' && /^\d+$/.test(maxSizeParam)) {
    params._maxAttachmentSize = parseInt(maxSizeParam, 10);
  }

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
  // First get all compartment resources
  const search: Partial<SearchRequest> = {
    types: params?._type,
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

  // Filter by requested date range
  filterByCareDate(bundle, params?.start, params?.end);

  // Recursively resolve references to resources not in the official compartment, but
  // which should be included for completeness
  await addResolvedReferences(repo, bundle.entry);
  bundle.entry = removeDuplicateEntries(bundle.entry);

  if (params?._inlineAttachments) {
    const maxBytes = params._maxAttachmentSize ?? DEFAULT_MAX_ATTACHMENT_SIZE;
    await inlineDocumentReferenceAttachments(repo, bundle.entry, maxBytes);
  }

  return bundle;
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
 * @param maxBytes - Max size for attachment to inline
 */
async function inlineDocumentReferenceAttachments(
  repo: Repository,
  entries: BundleEntry[] | undefined,
  maxBytes: number
): Promise<void> {
  if (!entries) {
    return;
  }
  for (const entry of entries) {
    const resource = entry.resource;
    if (resource?.resourceType !== 'DocumentReference') {
      continue;
    }
    const docRef = resource as WithId<DocumentReference>;
    if (!docRef.content) {
      continue;
    }
    for (const content of docRef.content) {
      const attachment = content.attachment;
      if (!attachment?.url) {
        continue;
      }
      const { id, versionId } = normalizeBinaryUrl(attachment.url);
      if (!id) {
        continue;
      }
      try {
        let binary: Binary;
        if (versionId) {
          binary = await repo.readVersion<Binary>('Binary', id, versionId);
        } else {
          binary = await repo.readResource<Binary>('Binary', id);
        }
        const stream = await getBinaryStorage().readBinary(binary);
        const buffer = await readStreamToBufferWithLimit(stream, maxBytes);
        if (buffer === null) {
          getLogger().debug('Skipping attachment inline: exceeds _maxAttachmentSize', { binaryId: id, maxBytes });
          continue;
        }
        attachment.data = buffer.toString('base64');
        if (!attachment.contentType && binary.contentType) {
          attachment.contentType = binary.contentType;
        }
        delete attachment.url;
      } catch (err) {
        getLogger().debug('Error inlining DocumentReference attachment', { error: err });
      }
    }
  }
}

/**
 * Reads a stream into a Buffer, aborting and returning null if the total byte count exceeds maxBytes.
 * The URL is left untouched for attachments that exceed the limit.
 * @param stream - binary input stream
 * @param maxBytes - Max size for attachment to inline
 * @returns Buffered binary stream
 */
async function readStreamToBufferWithLimit(stream: Readable, maxBytes: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      stream.destroy();
      return null;
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
  if (!entries) {
    return undefined;
  }
  const seen = new Set<string>();
  return entries.filter((entry) => {
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
