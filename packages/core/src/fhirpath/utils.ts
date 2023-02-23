import { ElementDefinition, Period, Quantity } from '@medplum/fhirtypes';
import { buildTypeName, getElementDefinition, isResource, PropertyType, TypedValue } from '../types';
import { capitalize, isEmpty } from '../utils';

/**
 * Returns a single element array with a typed boolean value.
 * @param value The primitive boolean value.
 * @returns Single element array with a typed boolean value.
 */
export function booleanToTypedValue(value: boolean): [TypedValue] {
  return [{ type: PropertyType.boolean, value }];
}

/**
 * Returns a "best guess" TypedValue for a given value.
 * @param value The unknown value to check.
 * @returns A "best guess" TypedValue for the given value.
 */
export function toTypedValue(value: unknown): TypedValue {
  if (value === null || value === undefined) {
    return { type: 'undefined', value: undefined };
  } else if (Number.isSafeInteger(value)) {
    return { type: PropertyType.integer, value };
  } else if (typeof value === 'number') {
    return { type: PropertyType.decimal, value };
  } else if (typeof value === 'boolean') {
    return { type: PropertyType.boolean, value };
  } else if (typeof value === 'string') {
    return { type: PropertyType.string, value };
  } else if (isQuantity(value)) {
    return { type: PropertyType.Quantity, value };
  } else if (isResource(value)) {
    return { type: value.resourceType, value };
  } else {
    return { type: PropertyType.BackboneElement, value };
  }
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
 * Returns the value of the property and the property type.
 * Some property definitions support multiple types.
 * For example, "Observation.value[x]" can be "valueString", "valueInteger", "valueQuantity", etc.
 * According to the spec, there can only be one property for a given element definition.
 * This function returns the value and the type.
 * @param input The base context (FHIR resource or backbone element).
 * @param path The property path.
 * @returns The value of the property and the property type.
 */
export function getTypedPropertyValue(input: TypedValue, path: string): TypedValue[] | TypedValue | undefined {
  if (!input?.value) {
    return undefined;
  }

  const elementDefinition = getElementDefinition(input.type, path);
  if (elementDefinition) {
    const typedResult = getTypedPropertyValueWithSchema(input, path, elementDefinition);
    if (typedResult) {
      return typedResult;
    }
  }

  return getTypedPropertyValueWithoutSchema(input, path);
}

/**
 * Returns the value of the property and the property type using a type schema.
 * @param input The base context (FHIR resource or backbone element).
 * @param path The property path.
 * @param property The property element definition.
 * @returns The value of the property and the property type.
 */
function getTypedPropertyValueWithSchema(
  input: TypedValue,
  path: string,
  property: ElementDefinition
): TypedValue[] | TypedValue | undefined {
  const types = property.type;
  if (!types || types.length === 0) {
    return undefined;
  }

  let resultValue: any = undefined;
  let resultType = 'undefined';

  if (types.length === 1) {
    resultValue = input.value[path];
    resultType = types[0].code as string;
  } else {
    for (const type of types) {
      const path2 = path.replace('[x]', '') + capitalize(type.code as string);
      if (path2 in input.value) {
        resultValue = input.value[path2];
        resultType = type.code as string;
        break;
      }
    }
  }

  if (isEmpty(resultValue)) {
    return undefined;
  }

  if (resultType === 'Element' || resultType === 'BackboneElement') {
    resultType = buildTypeName(property.path?.split('.') as string[]);
  }

  if (Array.isArray(resultValue)) {
    return resultValue.map((element) => toTypedValueWithType(element, resultType));
  } else {
    return toTypedValueWithType(resultValue, resultType);
  }
}

function toTypedValueWithType(value: any, type: string): TypedValue {
  if (type === 'Resource' && isResource(value)) {
    type = value.resourceType;
  }
  return { type, value };
}

/**
 * Returns the value of the property and the property type using a type schema.
 * Note that because the type schema is not available, this function may be inaccurate.
 * In some cases, that is the desired behavior.
 * @param typedValue The base context (FHIR resource or backbone element).
 * @param path The property path.
 * @returns The value of the property and the property type.
 */
function getTypedPropertyValueWithoutSchema(
  typedValue: TypedValue,
  path: string
): TypedValue[] | TypedValue | undefined {
  const input = typedValue.value;
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  let result: any = undefined;
  if (path in input) {
    result = (input as { [key: string]: unknown })[path];
  } else {
    // Only support property names that would be valid types
    // Examples:
    // value + valueString = ok, because "string" is valid
    // value + valueDecimal = ok, because "decimal" is valid
    // id + identifier = not ok, because "entifier" is not a valid type
    // resource + resourceType = not ok, because "type" is not a valid type
    for (const propertyType in PropertyType) {
      const propertyName = path + capitalize(propertyType);
      if (propertyName in input) {
        result = (input as { [key: string]: unknown })[propertyName];
        break;
      }
    }
  }

  if (isEmpty(result)) {
    return undefined;
  }

  if (Array.isArray(result)) {
    return result.map(toTypedValue);
  } else {
    return toTypedValue(result);
  }
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
 * Returns a negated FHIRPath boolean expression.
 * @param input The input array.
 * @returns The negated type value array.
 */
export function fhirPathNot(input: TypedValue[]): TypedValue[] {
  return booleanToTypedValue(!toJsBoolean(input));
}

/**
 * Determines if two arrays are equal according to FHIRPath equality rules.
 * @param x The first array.
 * @param y The second array.
 * @returns FHIRPath true if the arrays are equal.
 */
export function fhirPathArrayEquals(x: TypedValue[], y: TypedValue[]): TypedValue[] {
  if (x.length === 0 || y.length === 0) {
    return [];
  }
  if (x.length !== y.length) {
    return booleanToTypedValue(false);
  }
  return booleanToTypedValue(x.every((val, index) => toJsBoolean(fhirPathEquals(val, y[index]))));
}

/**
 * Determines if two values are equal according to FHIRPath equality rules.
 * @param x The first value.
 * @param y The second value.
 * @returns True if equal.
 */
export function fhirPathEquals(x: TypedValue, y: TypedValue): TypedValue[] {
  const xValue = x.value;
  const yValue = y.value;
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
 * Determines if two arrays are equivalent according to FHIRPath equality rules.
 * @param x The first array.
 * @param y The second array.
 * @returns FHIRPath true if the arrays are equivalent.
 */
export function fhirPathArrayEquivalent(x: TypedValue[], y: TypedValue[]): TypedValue[] {
  if (x.length === 0 && y.length === 0) {
    return booleanToTypedValue(true);
  }
  if (x.length !== y.length) {
    return booleanToTypedValue(false);
  }
  x.sort(fhirPathEquivalentCompare);
  y.sort(fhirPathEquivalentCompare);
  return booleanToTypedValue(x.every((val, index) => toJsBoolean(fhirPathEquivalent(val, y[index]))));
}

/**
 * Determines if two values are equivalent according to FHIRPath equality rules.
 * @param x The first value.
 * @param y The second value.
 * @returns True if equivalent.
 */
export function fhirPathEquivalent(x: TypedValue, y: TypedValue): TypedValue[] {
  const xValue = x.value;
  const yValue = y.value;
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

/**
 * Returns the sort order of two values for FHIRPath array equivalence.
 * @param x The first value.
 * @param y The second value.
 * @returns The sort order of the values.
 */
function fhirPathEquivalentCompare(x: TypedValue, y: TypedValue): number {
  const xValue = x.value;
  const yValue = y.value;
  if (typeof xValue === 'number' && typeof yValue === 'number') {
    return xValue - yValue;
  }
  if (typeof xValue === 'string' && typeof yValue === 'string') {
    return xValue.localeCompare(yValue);
  }
  return 0;
}

/**
 * Determines if the typed value is the desired type.
 * @param typedValue The typed value to check.
 * @param desiredType The desired type name.
 * @returns True if the typed value is of the desired type.
 */
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
 * See: https://dmitripavlutin.com/how-to-compare-objects-in-javascript/#4-deep-equality
 * @param object1 The first object.
 * @param object2 The second object.
 * @returns True if the objects are equal.
 */
function deepEquals<T1 extends object, T2 extends object>(object1: T1, object2: T2): boolean {
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

function isObject(obj: unknown): obj is object {
  return obj !== null && typeof obj === 'object';
}
