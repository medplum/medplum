import { Resource } from '@medplum/fhirtypes';

/**
 * Sorts an array of resources in place by meta.lastUpdated ascending.
 * @param resources - Array of resources.
 * @param timelineResource - Optional primary resource of a timeline view. If specified, the primary resource will be sorted by meta.lastUpdated descending.
 */
export function sortByDateAndPriority(resources: Resource[], timelineResource?: Resource): void {
  resources.sort((a: Resource, b: Resource): number => {
    const priority1 = getPriorityScore(a, timelineResource);
    const priority2 = getPriorityScore(b, timelineResource);
    if (priority1 > priority2) {
      return 1;
    }
    if (priority1 < priority2) {
      return -1;
    }
    return getTime(a, timelineResource) - getTime(b, timelineResource);
  });
}

function getPriorityScore(resource: Resource, timelineResource: Resource | undefined): number {
  if (!isSameResourceType(resource, timelineResource)) {
    // Only use priority if not the primary resource of a timeline view.

    const priority = (resource as any).priority;
    if (typeof priority === 'string') {
      return { stat: 4, asap: 3, urgent: 2 }[priority] ?? 0;
    }
  }
  return 0;
}

function getTime(resource: Resource, timelineResource: Resource | undefined): number {
  if (!isSameResourceType(resource, timelineResource)) {
    // Only use special case timestamps if not the primary resource of a timeline view.

    if (resource.resourceType === 'Communication' && resource.sent) {
      return new Date(resource.sent).getTime();
    }

    if (
      (resource.resourceType === 'DiagnosticReport' ||
        resource.resourceType === 'Media' ||
        resource.resourceType === 'Observation') &&
      resource.issued
    ) {
      return new Date(resource.issued).getTime();
    }

    if (resource.resourceType === 'DocumentReference' && resource.date) {
      return new Date(resource.date).getTime();
    }
  }

  const dateTime = resource.meta?.lastUpdated;
  if (!dateTime) {
    return 0;
  }
  return new Date(dateTime).getTime();
}

function isSameResourceType(a: Resource, b: Resource | undefined): boolean {
  return !!b && a.resourceType === b.resourceType && a.id === b.id;
}
