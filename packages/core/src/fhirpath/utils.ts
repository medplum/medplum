import { Period, Quantity } from '@medplum/fhirtypes';
import { PropertyType } from '../types';
import { TypedValue } from './atoms';

export const booleanToTypedValue = (value: boolean): TypedValue[] => [{ type: PropertyType.boolean, value }];

export function toTypedValue(value: any): TypedValue {
  if (typeof value === 'number') {
    return { type: PropertyType.integer, value };
  } else if (typeof value === 'boolean') {
    return { type: PropertyType.boolean, value };
  } else if (typeof value === 'string') {
    return { type: PropertyType.string, value };
  } else if (isQuantity(value)) {
    return { type: PropertyType.Quantity, value };
  } else {
    return { type: PropertyType.BackboneElement, value };
  }
}

/**
 * Determines if the input is an empty array.
 * @param obj Any value or array of values.
 * @returns True if the input is an empty array.
 */
export function isEmptyArray(obj: unknown): boolean {
  return Array.isArray(obj) && obj.length === 0;
}

export function isFalsy(obj: unknown): boolean {
  return !obj || isEmptyArray(obj);
}

/**
 * Converts unknown object into a JavaScript boolean.
 * Note that this is different than the FHIRPath "toBoolean",
 * which has particular semantics around arrays, empty arrays, and type conversions.
 * @param obj Any value or array of values.
 * @returns The converted boolean value according to FHIRPath rules.
 */
export function toJsBoolean(obj: TypedValue[]): boolean {
  return obj.length === 0 ? false : !!obj[0].value;
}

/**
 * Removes duplicates in array using FHIRPath equality rules.
 * @param arr The input array.
 * @returns The result array with duplicates removed.
 */
export function removeDuplicates(arr: TypedValue[]): TypedValue[] {
  const result: TypedValue[] = [];
  for (const i of arr) {
    let found = false;
    for (const j of result) {
      if (toJsBoolean(fhirPathEquals(i, j))) {
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
export function fhirPathEquals(x: TypedValue | TypedValue[], y: TypedValue | TypedValue[]): TypedValue[] {
  const xArray = Array.isArray(x);
  const yArray = Array.isArray(y);
  if (xArray && yArray) {
    if (isEmptyArray(x) || isEmptyArray(y)) {
      return [];
    }
    return booleanToTypedValue(
      x.length === y.length && x.every((val, index) => toJsBoolean(fhirPathEquals(val, y[index])))
    );
  }
  if (isFalsy(x) && isFalsy(y)) {
    return booleanToTypedValue(true);
  }
  if (isEmptyArray(x) || isEmptyArray(y)) {
    return [];
  }
  if (xArray || yArray) {
    return [];
  }
  const xValue = (x as TypedValue).value;
  const yValue = (y as TypedValue).value;
  if (typeof xValue === 'number' && typeof yValue === 'number') {
    return booleanToTypedValue(Math.abs(xValue - yValue) < 1e-8);
  }
  if (isQuantity(xValue) && isQuantity(yValue)) {
    return booleanToTypedValue(isQuantityEquivalent(xValue, yValue));
  }
  if (typeof xValue === 'object' && typeof yValue === 'object') {
    return booleanToTypedValue(deepEquals(x, y));
  }
  return booleanToTypedValue(xValue === yValue);
}

/**
 * Determines if two values are equal according to FHIRPath equality rules.
 * @param x The first value.
 * @param y The second value.
 * @returns True if equal.
 */
export function fhirPathEquivalent(x: TypedValue | TypedValue[], y: TypedValue | TypedValue[]): TypedValue[] {
  const xArray = Array.isArray(x);
  const yArray = Array.isArray(y);
  if (xArray && yArray) {
    if (isEmptyArray(x) && isEmptyArray(y)) {
      // Note that this implies that if the collections have a different number of items to compare,
      // or if one input is a value and the other is empty ({ }), the result will be false.
      // return false;
      return booleanToTypedValue(true);
    }

    if (isEmptyArray(x) || isEmptyArray(y)) {
      // Note that this implies that if the collections have a different number of items to compare,
      // or if one input is a value and the other is empty ({ }), the result will be false.
      // return false;
      return booleanToTypedValue(false);
    }
    x.sort(fhirPathEquivalentCompare);
    y.sort(fhirPathEquivalentCompare);
    return booleanToTypedValue(
      x.length === y.length && x.every((val, index) => toJsBoolean(fhirPathEquivalent(val, y[index])))
    );
  }
  if (isFalsy(x) && isFalsy(y)) {
    return booleanToTypedValue(true);
  }
  if (xArray || yArray) {
    return [];
  }
  const xValue = (x as TypedValue).value;
  const yValue = (y as TypedValue).value;
  if (typeof xValue === 'number' && typeof yValue === 'number') {
    // Use more generous threshold than equality
    // Decimal: values must be equal, comparison is done on values rounded to the precision of the least precise operand.
    // Trailing zeroes after the decimal are ignored in determining precision.
    return booleanToTypedValue(Math.abs(xValue - yValue) < 0.01);
  }
  if (isQuantity(xValue) && isQuantity(yValue)) {
    return booleanToTypedValue(isQuantityEquivalent(xValue, yValue));
  }
  if (typeof xValue === 'object' && typeof yValue === 'object') {
    return booleanToTypedValue(deepEquals(xValue, yValue));
  }
  if (typeof xValue === 'string' && typeof yValue === 'string') {
    // String: the strings must be the same, ignoring case and locale, and normalizing whitespace
    // (see String Equivalence for more details).
    return booleanToTypedValue(xValue.toLowerCase() === yValue.toLowerCase());
  }
  return booleanToTypedValue(xValue === yValue);
}

function fhirPathEquivalentCompare(a: TypedValue, b: TypedValue): number {
  const aVal = a.value;
  const bVal = b.value;
  if (typeof aVal === 'number' && typeof bVal === 'number') {
    return aVal - bVal;
  }
  if (typeof aVal === 'string' && typeof bVal === 'string') {
    return aVal.localeCompare(bVal);
  }
  return 0;
}

export function fhirPathIs(typedValue: TypedValue, desiredType: string): boolean {
  const { value } = typedValue;
  if (value === undefined || value === null) {
    return false;
  }

  switch (desiredType) {
    case 'Boolean':
      return typeof value === 'boolean';
    case 'Decimal':
    case 'Integer':
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
export function isPeriod(input: unknown): input is Period {
  return !!(input && typeof input === 'object' && 'start' in input);
}

/**
 * Determines if the input is a Quantity object.
 * This is heuristic based, as we do not have strong typing at runtime.
 * @param input The input value.
 * @returns True if the input is a quantity.
 */
export function isQuantity(input: unknown): input is Quantity {
  return !!(input && typeof input === 'object' && 'value' in input && typeof (input as Quantity).value === 'number');
}

export function isQuantityEquivalent(x: Quantity, y: Quantity): boolean {
  return (
    Math.abs((x.value as number) - (y.value as number)) < 0.01 &&
    (x.unit === y.unit || x.code === y.code || x.unit === y.code || x.code === y.unit)
  );
}

/**
 * Resource equality.
 * Ignores meta.versionId and meta.lastUpdated.
 * See: https://dmitripavlutin.com/how-to-compare-objects-in-javascript/#4-deep-equality
 * @param object1 The first object.
 * @param object2 The second object.
 * @returns True if the objects are equal.
 */
function deepEquals<T1, T2>(object1: T1, object2: T2): boolean {
  const keys1 = Object.keys(object1) as (keyof T1)[];
  const keys2 = Object.keys(object2) as (keyof T2)[];
  if (keys1.length !== keys2.length) {
    return false;
  }
  for (const key of keys1) {
    const val1 = object1[key] as unknown;
    const val2 = object2[key as unknown as keyof T2] as unknown;
    if (isObject(val1) && isObject(val2)) {
      if (!deepEquals(val1, val2)) {
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

function isObject(object: unknown): boolean {
  return object !== null && typeof object === 'object';
}
