import { Resource } from '@medplum/fhirtypes';

/**
 * Builds a set of Binary IDs from a resource.
 * @param resource - The resource to search for Binary references.
 * @param output - The output set where Binary IDs will be added.
 */
export function buildBinaryIds(resource: Resource, output: Set<string>): void {
  const resourceObj = JSON.stringify(resource);
  for (const match of resourceObj.matchAll(/"url":"Binary\/([a-f0-9-]+)"/g)) {
    output.add(match[1]);
  }
}
