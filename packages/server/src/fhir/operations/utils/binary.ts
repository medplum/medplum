import { Resource } from '@medplum/fhirtypes';

/**
 * Returns a set of Binary IDs from a resource.
 * @param resource - The resource to search for Binary references.
 * @returns A set of Binary IDs.
 */
export function getBinaryIds(resource: Resource): Set<string> {
  const output = new Set<string>();
  buildBinaryIds(resource, output);
  return output;
}

/**
 * Builds a set of Binary IDs from a resource.
 * @param resource - The resource to search for Binary references.
 * @param output - The output set where Binary IDs will be added.
 */
export function buildBinaryIds(resource: Resource, output: Set<string>): void {
  const resourceObj = JSON.stringify(resource);
  const matches = resourceObj.matchAll(/"url":"Binary\/([a-f0-9-]+)"/g);
  if (matches) {
    for (const match of matches) {
      output.add(match[1]);
    }
  }
}
