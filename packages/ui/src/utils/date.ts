import { Resource } from '@medplum/fhirtypes';

/**
 * Sorts an array of resources in place by meta.lastUpdated ascending.
 * @param resources Array of resources.
 */
export function sortByDateAndPriority(resources: Resource[]): void {
  resources.sort(resourceDateComparator);
}

function resourceDateComparator(a: Resource, b: Resource): number {
  const priority1 = getPriorityScore(a);
  const priority2 = getPriorityScore(b);
  if (priority1 > priority2) {
    return 1;
  }
  if (priority1 < priority2) {
    return -1;
  }
  return getTime(a) - getTime(b);
}

function getPriorityScore(resource: Resource): number {
  const priority = (resource as any).priority;
  if (typeof priority === 'string') {
    return { stat: 4, asap: 3, urgent: 2 }[priority] || 0;
  }
  return 0;
}

function getTime(resource: Resource): number {
  const dateTime = resource.meta?.lastUpdated;
  if (!dateTime) {
    return 0;
  }
  return new Date(dateTime).getTime();
}
