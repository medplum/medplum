import { Resource } from '@medplum/fhirtypes';

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
