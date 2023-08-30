import { isResource } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';

const PRIORITY_RANKINGS = { stat: 4, asap: 3, urgent: 2 } as const;

interface Timestamped {
  time: string;
}

/**
 * This is a type that you can use to check if something is sortable by `sortByDateAndPriorityGeneric` from this module.
 *
 * This could eventually be a mixin interface which establishes some methods to give information about how to sort a particular data type.
 */
export type TimeSortable = Timestamped | Resource;

/**
 * Sorts an array of resources in place by meta.lastUpdated ascending.
 * @param resources Array of resources.
 * @param timelineResource Optional primary resource of a timeline view. If specified, the primary resource will be sorted by meta.lastUpdated descending.
 */
export function sortByDateAndPriority(resources: Resource[], timelineResource?: Resource): void {
  resources.sort((a: Resource, b: Resource): number => {
    const priority1 = getPriorityScoreForResource(a, timelineResource);
    const priority2 = getPriorityScoreForResource(b, timelineResource);
    if (priority1 > priority2) {
      return 1;
    }
    if (priority1 < priority2) {
      return -1;
    }
    return getTimeForResource(a, timelineResource) - getTimeForResource(b, timelineResource);
  });
}

/**
 * Sorts an array of generic `TimeSortable`s based on type-specified time-sorting logic.
 * @param sortables Array of `TimeSortable`s. These are generic items that can be sorted alongside `Resource`s.
 * @param timelineResource Optional primary resource of a timeline view. If specified, the primary resource will be sorted by meta.lastUpdated descending.
 */
export function sortByDateAndPriorityGeneric(sortables: TimeSortable[], timelineResource?: Resource): void {
  sortables.sort((a: TimeSortable, b: TimeSortable): number => {
    const priority1 = getPriorityScoreGeneric(a, timelineResource);
    const priority2 = getPriorityScoreGeneric(b, timelineResource);
    if (priority1 > priority2) {
      return 1;
    }
    if (priority1 < priority2) {
      return -1;
    }
    return getTimeGeneric(a, timelineResource) - getTimeGeneric(b, timelineResource);
  });
}

function getPriorityScoreForResource(resource: Resource, timelineResource: Resource | undefined): number {
  if (!isSameResourceType(resource, timelineResource)) {
    // Only use priority if not the primary resource of a timeline view.

    const priority = (resource as any).priority;
    if (typeof priority === 'string') {
      return PRIORITY_RANKINGS[priority as keyof typeof PRIORITY_RANKINGS] ?? 0;
    }
  }
  return 0;
}

function getPriorityScoreGeneric(sortable: TimeSortable, timelineResource: Resource | undefined): number {
  if (isResource(sortable)) {
    return getPriorityScoreForResource(sortable, timelineResource);
  }
  return 0;
}

function getTimeForResource(resource: Resource, timelineResource: Resource | undefined): number {
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

function getTimeGeneric(sortable: TimeSortable, timelineResource: Resource | undefined): number {
  const sortableType = isResource(sortable) ? 'resource' : 'generic';

  switch (sortableType) {
    case 'resource':
      return getTimeForResource(sortable as Resource, timelineResource);
    case 'generic':
      return new Date((sortable as { time: string }).time).getTime();
    default:
      // should be unreachable...
      // if we get here there is a big problem
      return 'UNREACHABLE' as unknown as number;
  }
}

function isSameResourceType(a: Resource, b: Resource | undefined): boolean {
  return !!b && a.resourceType === b.resourceType && a.id === b.id;
}
