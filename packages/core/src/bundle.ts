// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Bundle,
  BundleEntry,
  BundleEntryRequest,
  ExtractResource,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { generateId } from './crypto';
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
 * Finds all references in a resource, including non-urn:uuid references.
 * Calls the callback with each reference string and the key it was found under.
 * @param resource - The resource to scan for references.
 * @param callback - Called with (referenceString, key) for each reference found.
 */
export function findAllReferences(resource: any, callback: (reference: string, key: string) => void): void {
  for (const key in resource) {
    if (resource[key] && typeof resource[key] === 'object') {
      const value = resource[key];
      if (isReference(value)) {
        callback(value.reference, key);
      } else {
        findAllReferences(value, callback);
      }
    }
  }
}

/**
 * Finds connected components in a bundle's reference graph, excluding references to specified resource types.
 * This groups resources that are linked together (e.g., DiagnosticReport + Observations) so they can
 * be kept in the same batch for reference resolution.
 *
 * Uses union-find for efficient component detection.
 *
 * @param entries - Bundle entries to analyze.
 * @param excludeResourceTypes - Resource types whose references should not form edges (e.g., Patient, Practitioner).
 *   References to these types are ignored when building the graph.
 * @returns An array of connected components, where each component is an array of BundleEntry.
 */
export function findConnectedComponents(
  entries: BundleEntry[],
  excludeResourceTypes: Set<string>
): BundleEntry[][] {
  // Map fullUrl -> index for union-find
  const urlToIndex = new Map<string, number>();
  // Map "ResourceType/id" -> index for resolving typed references
  const refToIndex = new Map<string, number>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.fullUrl) {
      urlToIndex.set(entry.fullUrl, i);
    }
    const resource = entry.resource;
    if (resource?.resourceType && resource.id) {
      refToIndex.set(`${resource.resourceType}/${resource.id}`, i);
    }
  }

  // Union-Find
  const parent = Array.from({ length: entries.length }, (_, i) => i);
  const rank = new Array(entries.length).fill(0);

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) {
      return;
    }
    if (rank[ra] < rank[rb]) {
      parent[ra] = rb;
    } else if (rank[ra] > rank[rb]) {
      parent[rb] = ra;
    } else {
      parent[rb] = ra;
      rank[ra]++;
    }
  }

  // Build edges: for each resource, find references and union them
  for (let i = 0; i < entries.length; i++) {
    const resource = entries[i].resource;
    if (!resource) {
      continue;
    }

    findAllReferences(resource, (reference: string) => {
      let targetIndex: number | undefined;

      if (reference.startsWith('urn:uuid:')) {
        targetIndex = urlToIndex.get(reference);
      } else if (reference.includes('/')) {
        const [refType] = reference.split('/');
        if (excludeResourceTypes.has(refType)) {
          return; // Skip references to excluded types
        }
        targetIndex = refToIndex.get(reference);
      }

      if (targetIndex !== undefined) {
        union(i, targetIndex);
      }
    });
  }

  // Group entries by component
  const components = new Map<number, BundleEntry[]>();
  for (let i = 0; i < entries.length; i++) {
    const root = find(i);
    let component = components.get(root);
    if (!component) {
      component = [];
      components.set(root, component);
    }
    component.push(entries[i]);
  }

  return Array.from(components.values());
}

/**
 * Redirects references in a resource. Replaces references matching entries in the redirectMap
 * with new reference strings (e.g., conditional references).
 * @param resource - The resource to modify in place.
 * @param redirectMap - A map from original reference strings (e.g., "Patient/123") to new reference strings
 *   (e.g., "Patient?identifier=http://example.com|123").
 */
export function redirectReferences(resource: any, redirectMap: Map<string, string>): void {
  for (const key in resource) {
    if (resource[key] && typeof resource[key] === 'object') {
      const value = resource[key];
      if (isReference(value) && typeof value.reference === 'string') {
        const replacement = redirectMap.get(value.reference);
        if (replacement) {
          value.reference = replacement;
        }
      } else {
        redirectReferences(value, redirectMap);
      }
    }
  }
}
