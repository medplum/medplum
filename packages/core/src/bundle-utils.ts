// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';
import { isReference } from './types';

/**
 * Finds all references in a resource, including non-urn:uuid references.
 * Calls the callback with each reference string and the key it was found under.
 * @param resource - The resource to scan for references.
 * @param callback - Called with (referenceString, key) for each reference found.
 */
function findAllReferences(resource: any, callback: (reference: string, key: string) => void): void {
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
function findConnectedComponents(entries: BundleEntry[], excludeResourceTypes: Set<string>): BundleEntry[][] {
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
 * Internal variant of findConnectedComponents that accepts a per-edge predicate instead of
 * a set of resource types. This is more flexible but slightly slower.
 * @param entries - The bundle entries to analyze.
 * @param ignoreReference - Predicate that returns true if a reference edge should be ignored.
 * @returns An array of connected components.
 */
function findConnectedComponentsWithPredicate(
  entries: BundleEntry[],
  ignoreReference: (referenceString: string, sourceResource: Resource) => boolean
): BundleEntry[][] {
  const urlToIndex = new Map<string, number>();
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

  for (let i = 0; i < entries.length; i++) {
    const resource = entries[i].resource;
    if (!resource) {
      continue;
    }

    findAllReferences(resource, (reference: string) => {
      if (ignoreReference(reference, resource)) {
        return;
      }

      let targetIndex: number | undefined;
      if (reference.startsWith('urn:uuid:')) {
        targetIndex = urlToIndex.get(reference);
      } else if (reference.includes('/')) {
        targetIndex = refToIndex.get(reference);
      }

      if (targetIndex !== undefined) {
        union(i, targetIndex);
      }
    });
  }

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
 * Options for {@link splitBundleByDependencies}.
 */
export interface SplitBundleOptions {
  /**
   * A predicate that determines whether a reference edge should be ignored when building the
   * dependency graph. When a reference from resource A to resource B is ignored, A and B are
   * not forced into the same group. Typically used to exclude references to "shared" resource
   * types (e.g., Patient, Practitioner, Organization) that will be ingested separately.
   *
   * @param referenceString - The full reference string (e.g., "Patient/123", "urn:uuid:abc").
   * @param sourceResource - The resource that contains the reference.
   * @returns `true` to ignore this edge, `false` to keep it.
   */
  ignoreReference?: (referenceString: string, sourceResource: Resource) => boolean;
}

/**
 * Splits a bundle into groups of entries that must stay together because they reference each other.
 *
 * Uses connected-component analysis on the reference graph: two entries end up in the same group
 * if there is any chain of references connecting them (ignoring edges filtered out by
 * `options.ignoreReference`). This is useful for breaking a large bundle into smaller batches
 * while preserving internal `urn:uuid:` references within each batch.
 *
 * @param bundle - The input bundle whose entries should be grouped.
 * @param options - Options to control which reference edges are considered.
 * @returns An array of entry groups, where each group is an array of BundleEntry that are
 *   connected in the reference graph.
 *
 * @example
 * ```ts
 * // Split a bundle, ignoring references to Patient and Practitioner
 * const groups = splitBundleByDependencies(bundle, {
 *   ignoreReference: (ref) => {
 *     const type = ref.split('/')[0];
 *     return ['Patient', 'Practitioner', 'Organization'].includes(type);
 *   },
 * });
 * ```
 */
export function splitBundleByDependencies(bundle: Bundle, options?: SplitBundleOptions): BundleEntry[][] {
  const entries = bundle.entry ?? [];
  if (entries.length === 0) {
    return [];
  }

  // If the caller provides a custom predicate, convert it to exclude resource types for findConnectedComponents
  // We need to use the more flexible approach here since ignoreReference is per-edge
  if (options?.ignoreReference) {
    return findConnectedComponentsWithPredicate(entries, options.ignoreReference);
  }

  // Default: no edges ignored, everything connected stays together
  return findConnectedComponents(entries, new Set());
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
