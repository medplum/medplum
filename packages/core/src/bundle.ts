import { Bundle, BundleEntry } from '@medplum/fhirtypes';
import { isReference } from './types';

/**
 * More on Bundles can be found here
 * http://hl7.org/fhir/R4/bundle.html
 */

/**
 * Takes a bundle and creates a Transaction Type bundle
 * @param bundle The Bundle object that we'll receive from the search query
 * @returns transaction type bundle
 */
export function convertToTransactionBundle(bundle: Bundle): Bundle {
  for (const entry of bundle.entry || []) {
    delete entry.resource?.meta;
    entry.fullUrl = 'urn:uuid:' + entry.resource?.id;
    delete entry.resource?.id;
  }
  const input = bundle.entry;
  const jsonString = JSON.stringify(
    {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: input?.map((entry: any) => ({
        fullUrl: entry.fullUrl,
        request: { method: 'POST', url: entry.resource.resourceType },
        resource: entry.resource,
      })),
    },
    replacer,
    2
  );
  return reorderBundle(JSON.parse(jsonString) as Bundle);
}

function replacer(key: string, value: string): string {
  if (key === 'reference' && typeof value === 'string' && value.includes('/')) {
    return 'urn:uuid:' + value.split('/')[1];
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
 * @param bundle Input bundle with type `batch` or `transaction`
 * @returns Bundle of the same type, with Bundle.entry reordered
 */
export function reorderBundle(bundle: Bundle): Bundle {
  const adjacencyList = buildAdjacencyList(bundle);
  const { sorted: sortedFullUrls, cycles } = topologicalSortWithCycles(adjacencyList);

  const entryMap: Record<string, BundleEntry> = {};

  for (const entry of bundle.entry || []) {
    if (entry.fullUrl) {
      entryMap[entry.fullUrl] = entry;
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
          ...originalEntry.request,
          method: 'PUT',
        },
      };
      reorderedEntries.push(putEntry);
    }
  }

  return { ...bundle, entry: reorderedEntries };
}

type AdjacencyList = Record<string, string[]>;

enum VertexState {
  NotVisited,
  Visiting,
  Visited,
}

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
  for (const entry of bundle.entry || []) {
    if (entry.fullUrl) {
      adjacencyList[entry.fullUrl] = [];
    }
  }

  for (const entry of bundle.entry || []) {
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
