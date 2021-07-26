
/**
 * Returns a formatted date string.
 * @param dateTime A date that can be either a ISO 8601 string or a Date object.
 * @returns A user-friendly formatted date string.
 */
export function formatDateTime(dateTime: string | Date): string {
  const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
  return date.toLocaleString();
}
