import { Resource } from '@medplum/fhirtypes';

/**
 * Sorts an array of resources in place by meta.lastUpdated ascending.
 * @param resources Array of resources.
 */
export function sortByDate(resources: Resource[]): void {
  resources.sort(resourceDateComparator);
}

function resourceDateComparator(a: Resource, b: Resource): number {
  return getTime(a) - getTime(b);
}

function getTime(resource: Resource): number {
  const dateTime = resource.meta?.lastUpdated;
  if (!dateTime) {
    return 0;
  }
  return new Date(dateTime).getTime();
}
