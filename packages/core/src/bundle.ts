// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Binary,
  Bundle,
  BundleEntry,
  BundleEntryRequest,
  ExtractResource,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import type { CreateBinaryOptions, MedplumClient, MedplumRequestOptions } from './client';
import { generateId } from './crypto';
import { getBuffer, isBrowserEnvironment } from './environment';
import { isReference } from './types';
import { deepClone, EMPTY } from './utils';

/**
 * More on Bundles can be found here
 * http://hl7.org/fhir/R4/bundle.html
 */

/**
 * Takes a bundle and creates a Transaction Type bundle
 * @param bundle - The Bundle object that we'll receive from the search query
 * @returns transaction type bundle
 */
export function convertToTransactionBundle(bundle: Bundle): Bundle {
  const idToUuid: Record<string, string> = {};
  bundle = deepClone(bundle);
  for (const entry of bundle.entry ?? EMPTY) {
    const resource = entry.resource;
    if (!resource) {
      continue;
    }
    if (resource.meta !== undefined) {
      delete resource.meta.author;
      delete resource.meta.compartment;
      delete resource.meta.lastUpdated;
      delete resource.meta.project;
      delete resource.meta.versionId;
      if (Object.keys(resource.meta).length === 0) {
        delete resource.meta;
      }
    }
    const id = resource?.id;
    if (id) {
      idToUuid[id] = generateId();

      entry.fullUrl = 'urn:uuid:' + idToUuid[id];
      delete entry.resource?.id;
    }
  }
  const input = bundle.entry;
  const jsonString = JSON.stringify(
    {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: input?.map((entry: BundleEntry) => ({
        fullUrl: entry.fullUrl,
        request: { method: 'POST', url: entry.resource?.resourceType },
        resource: entry.resource,
      })),
    },
    (key, value) => referenceReplacer(key, value, idToUuid),
    2
  );
  return reorderBundle(JSON.parse(jsonString) as Bundle);
}

function referenceReplacer(key: string, value: string, idToUuid: Record<string, string>): string {
  if (key === 'reference' && typeof value === 'string') {
    let id;
    if (value.includes('/')) {
      id = value.split('/')[1];
    } else if (value.startsWith('urn:uuid:')) {
      id = value.slice(9);
    } else if (value.startsWith('#')) {
      id = value.slice(1);
    }
    if (id) {
      const replacement = idToUuid[id];
      if (replacement) {
        return 'urn:uuid:' + replacement;
      }
    }
  }
  return value;
}

/**
 * Topologically sorts a `batch` or `transaction` bundle to improve reference resolution.
 * The bundle is sorted such that a resource is created _before_ references to that resource appear in the bundle.
 *
 * In the event of cycles, this function will first create a POST request for each resource in the cycle, and then will
 * append a PUT request to the bundle. This ensures that each resources in the cycle is visited twice, and all
 * references can be resolved
 * @param bundle - Input bundle with type `batch` or `transaction`
 * @returns Bundle of the same type, with Bundle.entry reordered
 */
export function reorderBundle(bundle: Bundle): Bundle {
  const adjacencyList = buildAdjacencyList(bundle);
  const { sorted: sortedFullUrls, cycles } = topologicalSortWithCycles(adjacencyList);

  const entryMap: Record<string, BundleEntry> = {};
  const entriesWithoutFullUrl: BundleEntry[] = [];

  for (const entry of bundle.entry ?? EMPTY) {
    if (entry.fullUrl) {
      entryMap[entry.fullUrl] = entry;
    } else {
      // Preserve entries without fullUrl (e.g., PATCH operations)
      // These don't need topological sorting since they operate on existing resources
      entriesWithoutFullUrl.push(entry);
    }
  }

  const reorderedEntries = sortedFullUrls.map((fullUrl) => entryMap[fullUrl]);

  // Handle cycles by appending additional entries with a method of 'PUT'
  for (const cycle of cycles) {
    for (const fullUrl of cycle) {
      const originalEntry = entryMap[fullUrl];
      const putEntry: BundleEntry = {
        ...originalEntry,
        request: {
          ...(originalEntry.request as BundleEntryRequest),
          method: 'PUT',
        },
      };
      reorderedEntries.push(putEntry);
    }
  }

  // Append entries without fullUrl at the end (e.g., PATCH operations that update existing resources)
  reorderedEntries.push(...entriesWithoutFullUrl);

  return { ...bundle, entry: reorderedEntries };
}

type AdjacencyList = Record<string, string[]>;

const VertexState = {
  NotVisited: 'NotVisited',
  Visiting: 'Visiting',
  Visited: 'Visited',
} as const;
type VertexState = (typeof VertexState)[keyof typeof VertexState];

function topologicalSortWithCycles(graph: AdjacencyList): { sorted: string[]; cycles: string[][] } {
  const sorted: string[] = [];
  const state: Record<string, VertexState> = {};
  const cycles: string[][] = [];

  // Initialize all vertices to NotVisited state
  for (const vertex of Object.keys(graph)) {
    state[vertex] = VertexState.NotVisited;
  }

  function visit(vertex: string, path: string[]): boolean {
    // If this vertex is already visited, return true
    if (state[vertex] === VertexState.Visited) {
      return true;
    }

    // If this vertex is currently being visited, we have a cycle
    if (state[vertex] === VertexState.Visiting) {
      const cycleStartIndex = path.lastIndexOf(vertex);
      if (cycleStartIndex !== -1) {
        cycles.push(path.slice(cycleStartIndex));
      }
      return true; // return true for vertices that are part of cycles
    }

    // Mark the vertex as visiting and add it to the path
    state[vertex] = VertexState.Visiting;
    path.push(vertex);

    // Visit all neighbors
    let hasCycle = false;
    for (const neighbor of graph[vertex]) {
      if (!visit(neighbor, path)) {
        hasCycle = true;
      }
    }

    // Mark the vertex as visited, remove it from the path, and add it to the sorted list
    state[vertex] = VertexState.Visited;
    path.pop();
    sorted.unshift(vertex);

    return !hasCycle;
  }

  for (const vertex in graph) {
    if (state[vertex] === VertexState.NotVisited) {
      const path: string[] = [];
      visit(vertex, path);
    }
  }

  return { sorted, cycles };
}

function findReferences(resource: any, callback: (reference: string) => void): void {
  for (const key in resource) {
    if (resource[key] && typeof resource[key] === 'object') {
      const value = resource[key];

      if (isReference(value)) {
        const reference = value.reference;
        if (reference.startsWith('urn:uuid:')) {
          callback(reference);
        }
      } else {
        findReferences(value, callback);
      }
    }
  }
}

function buildAdjacencyList(bundle: Bundle): AdjacencyList {
  const adjacencyList: AdjacencyList = {};

  // Initialize adjacency list with empty arrays for each entry's fullUrl
  for (const entry of bundle.entry ?? EMPTY) {
    if (entry.fullUrl) {
      adjacencyList[entry.fullUrl] = [];
    }
  }

  for (const entry of bundle.entry ?? EMPTY) {
    const fullUrl = entry.fullUrl;

    if (entry.resource) {
      findReferences(entry.resource, (reference: string) => {
        // Add an incoming reference to the adjacency list
        if (adjacencyList[reference]) {
          adjacencyList[reference].push(fullUrl as string);
        }
      });
    }
  }

  return adjacencyList;
}

/**
 * Converts a resource with contained resources to a transaction bundle.
 * This function is useful when creating a resource that contains other resources.
 * Handles local references and topological sorting.
 * @param resource - The input resource which may or may not include contained resources.
 * @returns A bundle with the input resource and all contained resources.
 */
export function convertContainedResourcesToBundle(resource: Resource & { contained?: Resource[] }): Bundle {
  // Create a clone so we don't modify the original resource
  resource = deepClone(resource);

  // Create the simple naive bundle
  const simpleBundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [{ resource }],
  } satisfies Bundle;

  // Move all contained resources to the bundle
  if (resource.contained) {
    for (const contained of resource.contained) {
      simpleBundle.entry.push({ resource: contained });
    }
    resource.contained = undefined;
  }

  // Make sure that all resources have an ID
  // This is required for convertToTransactionBundle
  for (const entry of simpleBundle.entry) {
    if (entry.resource && !entry.resource.id) {
      entry.resource.id = generateId();
    }
  }

  // Convert to a transaction bundle
  // This adds fullUrl and request properties to each entry
  // and reorders the bundle to ensure that contained resources are created before they are referenced.
  return convertToTransactionBundle(simpleBundle);
}

export function findResourceInBundle<K extends ResourceType>(
  bundle: Bundle,
  resourceType: K,
  id: string
): ExtractResource<K> {
  return bundle.entry?.find(({ resource }) => resource?.resourceType === resourceType && resource?.id === id)
    ?.resource as ExtractResource<K>;
}

/**
 * Returns true if the given Bundle entry represents a Binary create operation
 * (i.e. a POST request to `Binary` with a `Binary` resource payload).
 * @param entry - The Bundle entry to check.
 * @returns True if the entry is a Binary create entry.
 */
export function isBinaryCreateEntry(entry: BundleEntry): boolean {
  return (
    entry.request?.method === 'POST' && entry.request?.url === 'Binary' && entry.resource?.resourceType === 'Binary'
  );
}

/**
 * Recursively rewrites `Reference.reference` and `Attachment.url` fields in an object tree,
 * replacing any value that exactly matches a key in the provided map with the corresponding value.
 *
 * Only exact matches of full-URL strings are replaced (no substring replacement).
 * @param obj - The object (or primitive) to traverse.
 * @param map - A map from old reference strings (e.g. `urn:uuid:…`) to new reference strings (e.g. `Binary/{id}`).
 * @returns The same structure with references rewritten.
 */
export function rewriteResourceReferences(obj: unknown, map: Map<string, string>): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => rewriteResourceReferences(item, map));
  }
  if (obj !== null && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (typeof value === 'string' && (key === 'reference' || key === 'url')) {
        result[key] = map.get(value) ?? value;
      } else {
        result[key] = rewriteResourceReferences(value, map);
      }
    }
    return result;
  }
  return obj;
}

/**
 * Decodes a base64-encoded string to a `Uint8Array` of raw bytes.
 * Works in both browser and Node.js environments.
 * @param base64 - The base64-encoded string.
 * @returns The decoded bytes.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (isBrowserEnvironment()) {
    const binaryString = window.atob(base64);
    return Uint8Array.from(binaryString, (c) => c.codePointAt(0) ?? 0);
  }
  const BufferConstructor = getBuffer();
  if (BufferConstructor) {
    return new Uint8Array(BufferConstructor.from(base64, 'base64'));
  }
  throw new Error('Unable to decode base64: no suitable runtime available');
}

/**
 * Converts a Binary Bundle entry into `CreateBinaryOptions` suitable for `MedplumClient.createBinary`.
 *
 * The `Binary.data` field (base64-encoded bytes) is decoded to a `Uint8Array`.
 * @param entry - A Bundle entry whose resource is a FHIR `Binary`.
 * @returns The corresponding `CreateBinaryOptions`.
 * @throws Error if `contentType` or `data` is missing from the Binary resource.
 */
export function binaryOptionsFromEntry(entry: BundleEntry): CreateBinaryOptions {
  const binary = entry.resource as Binary;
  if (!binary.contentType) {
    throw new Error('Binary resource is missing contentType');
  }
  if (!binary.data) {
    throw new Error('Binary resource is missing data');
  }
  return {
    data: base64ToUint8Array(binary.data),
    contentType: binary.contentType,
    securityContext: binary.securityContext,
  };
}

/**
 * Executes a FHIR batch or transaction Bundle that may contain `Binary` create entries.
 *
 * Binary resources present challenges in standard batch/transaction workflows (not searchable,
 * inefficient base64 encoding, no streaming support). This function pre-processes the Bundle by:
 *
 * 1. Extracting `Binary` create entries (POST to `Binary` with base64 `data`)
 * 2. Uploading them individually via `MedplumClient.createBinary` (streaming-friendly)
 * 3. Rewriting all `Reference.reference` and `Attachment.url` fields in the remaining entries
 *    that reference those Binary `fullUrl` values
 * 4. Executing the remaining Bundle via `MedplumClient.executeBatch`
 * 5. Returning a merged response Bundle that includes synthetic response entries for the
 *    Binary uploads and the actual entries from the batch response
 *
 * **Important:** This is **not** a true FHIR transaction. Binary uploads happen outside the
 * batch/transaction scope, so a partial failure (e.g. `createBinary` succeeding but
 * `executeBatch` failing) may leave orphaned `Binary` resources on the server.
 *
 * @param medplum - The MedplumClient instance used to upload Binaries and execute the batch.
 * @param bundle - The FHIR batch/transaction bundle, which may contain Binary create entries.
 * @param options - Optional fetch options passed to `MedplumClient.executeBatch`.
 * @returns A synthetic merged response Bundle preserving original entry order.
 */
export async function executeBatchWithBinary(
  medplum: MedplumClient,
  bundle: Bundle,
  options?: MedplumRequestOptions
): Promise<Bundle> {
  const entries = bundle.entry ?? [];

  // Split entries into Binary creates and everything else, preserving original indices
  const binaryEntries: { index: number; entry: BundleEntry }[] = [];
  const otherEntries: { index: number; entry: BundleEntry }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (isBinaryCreateEntry(entry)) {
      binaryEntries.push({ index: i, entry });
    } else {
      otherEntries.push({ index: i, entry });
    }
  }

  // Upload each Binary and build a fullUrl → "Binary/{id}" reference map
  const fullUrlToReference = new Map<string, string>();
  const binaryResults: { index: number; resource: Binary & { id: string } }[] = [];

  for (const { index, entry } of binaryEntries) {
    const { fullUrl } = entry;
    if (!fullUrl) {
      throw new Error('Binary entry is missing fullUrl, which is required for reference rewriting');
    }
    const binaryOptions = binaryOptionsFromEntry(entry);
    const result = await medplum.createBinary(binaryOptions);
    fullUrlToReference.set(fullUrl, `Binary/${result.id}`);
    binaryResults.push({ index, resource: result });
  }

  // Rewrite references in the non-Binary entries and execute the shadow bundle
  const rewrittenOtherEntries = otherEntries.map(({ index, entry }) => ({
    index,
    entry: rewriteResourceReferences(entry, fullUrlToReference) as BundleEntry,
  }));

  const shadowBundle: Bundle = { ...bundle, entry: rewrittenOtherEntries.map(({ entry }) => entry) };
  const batchResponse = await medplum.executeBatch(shadowBundle, options);
  const batchResponseEntries = batchResponse.entry ?? [];

  // Reconstruct the response in the original entry order
  const responseEntries: BundleEntry[] = new Array(entries.length);

  for (const { index, resource } of binaryResults) {
    responseEntries[index] = {
      response: { status: '201 Created', location: `Binary/${resource.id}` },
      resource,
    };
  }

  for (let i = 0; i < rewrittenOtherEntries.length; i++) {
    const { index } = rewrittenOtherEntries[i];
    responseEntries[index] = batchResponseEntries[i] ?? {};
  }

  return { resourceType: 'Bundle', type: 'batch-response', entry: responseEntries };
}
