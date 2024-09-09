import { Resource } from '@medplum/fhirtypes';

/**
 * Cleans a resource of meta data including `lastUpdated`, `versionId`, and `author`. This allows the resource to be updated without
 * retaining outdated information.
 *
 * @param resource - The resoure to be cleened
 * @returns Resource - a resource without certain meta data. This allows the resource in question to be safely updated.
 */
export function cleanResource(resource: Resource): Resource {
  let meta = resource.meta;
  if (meta) {
    meta = {
      ...meta,
      lastUpdated: undefined,
      versionId: undefined,
      author: undefined,
    };
  }
  return {
    ...resource,
    meta,
  };
}
