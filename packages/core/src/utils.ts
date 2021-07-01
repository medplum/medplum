
// Precompute hex octets
// See: https://stackoverflow.com/a/55200387
const byteToHex: string[] = [];
for (let n = 0; n < 256; n++) {
  byteToHex.push(n.toString(16).padStart(2, '0'));
}

/**
 * Converts an ArrayBuffer to hex string.
 * See: https://stackoverflow.com/a/55200387
 * @param arrayBuffer The input array buffer.
 * @returns The resulting hex string.
 */
export function arrayBufferToHex(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const result: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[i] = byteToHex[bytes[i]];
  }
  return result.join('');
}

export function arrayBufferToBase64(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const result: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
      result[i] = String.fromCharCode(bytes[i]);
  }
  return btoa(result.join(''));
}

/**
 * Returns a Date property as a Date.
 * When working with JSON objects, Dates are often serialized as ISO-8601 strings.
 * When that happens, we need to safely convert to a proper Date object.
 * @param date The date property value, which could be a string or a Date object.
 * @returns A Date object.
 */
 export function getDateProperty(date: Date | string | undefined): Date | undefined {
  if (date instanceof Date) {
    return date;
  }
  if (typeof date === 'string') {
    return new Date(date);
  }
  return undefined;
}
