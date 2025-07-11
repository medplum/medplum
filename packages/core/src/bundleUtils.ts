import { Bundle, Resource } from '@medplum/fhirtypes';

/**
 * Groups all resources in a FHIR Bundle by their resourceType.
 * @param bundle The FHIR Bundle to process.
 * @returns A Map where the key is the resourceType and the value is an array of resources of that type.
 */
export function getResourcesByType(bundle: Bundle): Map<string, Resource[]> {
  const map = new Map<string, Resource[]>();
  if (!bundle?.entry) return map;
  for (const entry of bundle.entry) {
    const resource = entry.resource;
    if (resource && resource.resourceType) {
      if (!map.has(resource.resourceType)) {
        map.set(resource.resourceType, []);
      }
      map.get(resource.resourceType)!.push(resource);
    }
  }
  return map;
}

/**
 * Populates Reference.resource for all references in the bundle that can be resolved.
 * This mutates the input bundle and its resources.
 * @param bundle The FHIR Bundle to process.
 * @returns The same bundle, with Reference.resource populated where possible.
 */
export function populateReferences(bundle: Bundle): Bundle {
  if (!bundle?.entry) return bundle;

  // Build a lookup map of all resources in the bundle
  const resourceMap = new Map<string, Resource>();
  for (const entry of bundle.entry) {
    const resource = entry.resource;
    if (resource && resource.resourceType && resource.id) {
      resourceMap.set(`${resource.resourceType}/${resource.id}`, resource);
    }
  }

  // Recursively populate references
  for (const entry of bundle.entry) {
    if (entry.resource) {
      _populateResourceReferences(entry.resource, resourceMap);
    }
  }

  return bundle;
}

function _populateResourceReferences(obj: any, resourceMap: Map<string, Resource>): void {
  const visited = new Set();

  function traverse(node: any) {
    if (!node || typeof node !== 'object' || visited.has(node)) return;

    visited.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        traverse(item);
      }
      return;
    }

    // Inject resource if it's a FHIR Reference
    if (typeof node.reference === 'string' && !node.resource) {
      const resource = resourceMap.get(node.reference);
      if (resource) {
        node.resource = resource;
      }
    }

    for (const key of Object.keys(node)) {
      traverse(node[key]);
    }
  }

  traverse(obj);
}
