export function parseDateString(str: string): string {
  if (str.startsWith('T')) {
    // If a time string,
    // then normalize to full length.
    return str + 'T00:00:00.000Z'.substring(str.length);
  }

  if (str.length <= 10) {
    // If a local date (i.e., "2021-01-01"),
    // then return as-is.
    return str;
  }

  try {
    // Try to normalize to UTC
    return new Date(str).toISOString();
  } catch (_err) {
    // Fallback to original input
    // This happens on unsupported time formats such as "2021-01-01T12"
    return str;
  }
}
