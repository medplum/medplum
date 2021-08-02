
/**
 * Compares two arrays of objects.
 * @param incoming The incoming array of elements.
 * @param existing The existing array of elements.
 * @returns True if the arrays are equal.  False if they are different.
 */
export function compareArrays(incoming: any[], existing: any[]): boolean {
  if (incoming.length !== existing.length) {
    return false;
  }

  for (let i = 0; i < incoming.length; i++) {
    if (JSON.stringify(incoming[i]) !== JSON.stringify(existing[i])) {
      return false;
    }
  }

  return true;
}
