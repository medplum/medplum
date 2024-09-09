/**
 * Returns a month display string (e.g. "January 2020").
 * @param date - Any date within the month.
 * @returns The month display string (e.g. "January 2020")
 */
export function getMonthString(date: Date): string {
  return date.toLocaleString('default', { month: 'long' }) + ' ' + date.getFullYear();
}

export function getStartMonth(): Date {
  const result = new Date();
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}
