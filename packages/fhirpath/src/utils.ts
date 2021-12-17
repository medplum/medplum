import { Quantity } from '@medplum/fhirtypes';

/**
 * Ensures that the value is wrapped in an array.
 * @param input The input as a an array or a value.
 * @returns The input as an array.
 */
export function ensureArray(input: any): any[] {
  if (input === null || input === undefined) {
    return [];
  }
  return Array.isArray(input) ? input : [input];
}

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
 * Converts any object into a JavaScript boolean.
 * Note that this is different than the FHIRPath "toBoolean",
 * which has particular semantics around arrays, empty arrays, and type conversions.
 * @param obj Any value or array of values.
 * @returns The converted boolean value according to FHIRPath rules.
 */
export function toJsBoolean(obj: any): boolean {
  if (Array.isArray(obj)) {
    return obj.length === 0 ? false : !!obj[0];
  }
  return !!obj;
}

/**
 * Removes duplicates in array using FHIRPath equality rules.
 * @param arr The input array.
 * @returns The result array with duplicates removed.
 */
export function removeDuplicates(arr: any[]): any[] {
  const result: any[] = [];
  for (const i of arr) {
    let found = false;
    for (const j of result) {
      if (fhirPathEquals(i, j)) {
        found = true;
        break;
      }
    }
    if (!found) {
      result.push(i);
    }
  }
  return result;
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
  if (typeof x === 'number' && typeof y === 'number') {
    return Math.abs(x - y) < 1e-8;
  }
  if (isQuantity(x) && isQuantity(y)) {
    return isQuantityEquivalent(x, y);
  }
  if (Array.isArray(x) && Array.isArray(y)) {
    return x.length === y.length && x.every((val, index) => fhirPathEquals(val, y[index]));
  }
  if (typeof x === 'object' && typeof y === 'object') {
    return deepEquals(x, y);
  }
  return x === y;
}

/**
 * Determines if two values are equal according to FHIRPath equality rules.
 * @param x The first value.
 * @param y The second value.
 * @returns True if equal.
 */
export function fhirPathEquivalent(x: any, y: any): boolean | [] {
  if (isFalsy(x) && isFalsy(y)) {
    return true;
  }
  if (isEmptyArray(x) || isEmptyArray(y)) {
    // Note that this implies that if the collections have a different number of items to compare,
    // or if one input is a value and the other is empty ({ }), the result will be false.
    return false;
  }
  if (typeof x === 'number' && typeof y === 'number') {
    // Use more generous threshold than equality
    // Decimal: values must be equal, comparison is done on values rounded to the precision of the least precise operand.
    // Trailing zeroes after the decimal are ignored in determining precision.
    return Math.abs(x - y) < 0.01;
  }
  if (isQuantity(x) && isQuantity(y)) {
    return isQuantityEquivalent(x, y);
  }
  if (Array.isArray(x) && Array.isArray(y)) {
    // If both operands are collections with multiple items:
    //   1) Each item must be equivalent
    //   2) Comparison is not order dependent
    x = x.sort();
    y = y.sort();
    return x.length === y.length && x.every((val: any, index: number) => fhirPathEquals(val, y[index]));
  }
  if (typeof x === 'object' && typeof y === 'object') {
    return deepEquals(x, y);
  }
  if (typeof x === 'string' && typeof y === 'string') {
    // String: the strings must be the same, ignoring case and locale, and normalizing whitespace
    // (see String Equivalence for more details).
    return x.toLowerCase() === y.toLowerCase();
  }
  return x === y;
}

export function fhirPathIs(value: any, desiredType: any): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  switch (desiredType) {
    case 'Boolean':
      return typeof value === 'boolean';
    case 'Decimal':
    case 'Integer':
    case 'System.Integer':
      return typeof value === 'number';
    case 'Date':
      return typeof value === 'string' && !!value.match(/^\d{4}(-\d{2}(-\d{2})?)?/);
    case 'DateTime':
      return typeof value === 'string' && !!value.match(/^\d{4}(-\d{2}(-\d{2})?)?T/);
    case 'Time':
      return typeof value === 'string' && !!value.match(/^T\d/);
    case 'Period':
      return isPeriod(value);
    case 'Quantity':
      return isQuantity(value);
    default:
      return typeof value === 'object' && value?.resourceType === desiredType;
  }
}

/**
 * Determines if the input is a Period object.
 * This is heuristic based, as we do not have strong typing at runtime.
 * @param input The input value.
 * @returns True if the input is a period.
 */
export function isPeriod(input: any): boolean {
  return input && typeof input === 'object' && 'start' in input;
}

/**
 * Determines if the input is a Quantity object.
 * This is heuristic based, as we do not have strong typing at runtime.
 * @param input The input value.
 * @returns True if the input is a quantity.
 */
export function isQuantity(input: any): boolean {
  return input && typeof input === 'object' && 'value' in input && typeof input.value === 'number';
}

export function isQuantityEquivalent(x: Quantity, y: Quantity): boolean {
  return Math.abs((x.value as number) - (y.value as number)) < 0.01 && (x.unit === y.unit || x.code === y.code || x.unit === y.code || x.code === y.unit);
}

/**
 * Resource equality.
 * Ignores meta.versionId and meta.lastUpdated.
 * See: https://dmitripavlutin.com/how-to-compare-objects-in-javascript/#4-deep-equality
 * @param object1 The first object.
 * @param object2 The second object.
 * @returns True if the objects are equal.
 */
export function deepEquals(object1: any, object2: any, path?: string): boolean {
  let keys1 = Object.keys(object1);
  let keys2 = Object.keys(object2);
  if (path === 'meta') {
    keys1 = keys1.filter(k => k !== 'versionId' && k !== 'lastUpdated' && k !== 'author');
    keys2 = keys2.filter(k => k !== 'versionId' && k !== 'lastUpdated' && k !== 'author');
  }
  if (keys1.length !== keys2.length) {
    return false;
  }
  for (const key of keys1) {
    const val1 = object1[key];
    const val2 = object2[key];
    if (isObject(val1) && isObject(val2)) {
      if (!deepEquals(val1, val2, key)) {
        return false;
      }
    } else {
      if (val1 !== val2) {
        return false;
      }
    }
  }
  return true;
}

function isObject(object: any): boolean {
  return object !== null && typeof object === 'object';
}
