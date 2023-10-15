import { Resource } from '@medplum/fhirtypes';

export function getVersionUrl(resource: Resource, versionId: string): string {
  return `/${resource.resourceType}/${resource.id}/_history/${versionId}`;
}

export function getTimeString(lastUpdated: string): string {
  const seconds = Math.floor((Date.now() - Date.parse(lastUpdated)) / 1000);

  const years = Math.floor(seconds / 31536000);
  if (years > 0) {
    return pluralizeTime(years, 'year');
  }

  const months = Math.floor(seconds / 2592000);
  if (months > 0) {
    return pluralizeTime(months, 'month');
  }

  const days = Math.floor(seconds / 86400);
  if (days > 0) {
    return pluralizeTime(days, 'day');
  }

  const hours = Math.floor(seconds / 3600);
  if (hours > 0) {
    return pluralizeTime(hours, 'hour');
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return pluralizeTime(minutes, 'minute');
  }

  return pluralizeTime(seconds, 'second');
}

function pluralizeTime(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : noun + 's'} ago`;
}
