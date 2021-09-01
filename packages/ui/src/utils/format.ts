import { Bundle, BundleEntry, Resource } from '@medplum/core';

/**
 * Returns a formatted date string.
 * @param dateTime A date that can be either a ISO 8601 string or a Date object.
 * @returns A user-friendly formatted date string.
 */
export function formatDateTime(dateTime: string | Date | undefined): string {
  if (!dateTime) {
    return '';
  }
  const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
  return date.toLocaleString();
}

export function sortByDate(resources: Resource[]): void {
  resources.sort(resourceDateComparator);
}

function resourceDateComparator(a: Resource, b: Resource): number {
  return getIsoDateString(a.meta?.lastUpdated).localeCompare(getIsoDateString(b.meta?.lastUpdated));
}

function getIsoDateString(dateTime: string | Date | undefined): string {
  if (!dateTime) {
    return '';
  }
  const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
  return date.toISOString();
}

export function sortBundleByDate(bundle: Bundle): void {
  bundle.entry?.sort(bundleEntryDateComparator);
}

function bundleEntryDateComparator(a: BundleEntry, b: BundleEntry): number {
  return resourceDateComparator(a.resource as Resource, b.resource as Resource);
}
