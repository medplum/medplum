
/**
 * Applies a function to single value or an array of values.
 * @param context The context which will be passed to the function.
 * @param fn The function to apply.
 * @returns The result of the function.
 */
export function applyMaybeArray(context: any, fn: (context: any) => any): any {
  if (context === undefined) {
    return undefined;
  }
  if (Array.isArray(context)) {
    return context.map(e => fn(e)).filter(e => !!e).flat();
  } else {
    return fn(context);
  }
}

/**
 * Determines if the input is an empty array.
 * @param obj Any value or array of values.
 * @returns True if the input is an empty array.
 */
export function isEmptyArray(obj: any): boolean {
  return Array.isArray(obj) && obj.length === 0;
}

export function isFalsy(obj: any): boolean {
  return !obj || isEmptyArray(obj);
}

/**
 * Converts any object into a boolean.
 * @param obj Any value or array of values.
 * @returns The converted boolean value according to FHIRPath rules.
 */
export function toBoolean(obj: any): boolean {
  return isEmptyArray(obj) ? false : !!obj;
}

/**
 * Determines if two values are equal according to FHIRPath equality rules.
 * @param x The first value.
 * @param y The second value.
 * @returns True if equal.
 */
export function fhirPathEquals(x: any, y: any): boolean | [] {
  if (isFalsy(x) && isFalsy(y)) {
    return true;
  }
  if (isEmptyArray(x) || isEmptyArray(y)) {
    return [];
  }
  if (x instanceof Date && y instanceof Date) {
    return x.toISOString() === y.toISOString();
  }
  if (typeof x === 'number' && typeof y === 'number') {
    return Math.abs(x - y) < 0.00001;
  }
  return x === y;
}

export function fhirPathIs(value: any, desiredType: any): boolean {
  if (typeof value === 'object' && value?.resourceType === desiredType) {
    return true;
  }

  if (typeof value === 'boolean' && desiredType === 'Boolean') {
    return true;
  }

  return false;
}
