import { Resource } from '@medplum/fhirtypes';

/**
 * Cleans a resource of unwanted meta values.
 * For most users, this will not matter, because meta values are set by the server.
 * However, some administrative users are allowed to specify some meta values.
 * The admin use case is special though, and unwanted here on the resource page.
 * @param resource - The input resource.
 * @returns The cleaned output resource.
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

/**
 * Adds the supplied profileUrl to the resource.meta.profile if it is not already
 * specified
 * @param resource - A FHIR resource
 * @param profileUrl - The profile URL to add
 */
export function addProfileToResource(resource: Resource, profileUrl: string): void {
  if (!resource?.meta?.profile?.includes(profileUrl)) {
    resource.meta = resource.meta ?? {};
    resource.meta.profile = resource.meta.profile ?? [];
    resource.meta.profile.push(profileUrl);
  }
}

/**
 * Removes the supplied profileUrl from the resource.meta.profile if it is present
 * @param resource - A FHIR resource
 * @param profileUrl - The profile URL to remove
 */
export function removeProfileFromResource(resource: Resource, profileUrl: string): void {
  if (resource?.meta?.profile?.includes(profileUrl)) {
    const index = resource.meta.profile.indexOf(profileUrl);
    resource.meta.profile.splice(index, 1);
  }
}
