import { Coding, Extension, Period, Quantity } from '@medplum/fhirtypes';
import { PropertyType, TypedValue, getElementDefinition, isResource } from '../types';
import { InternalSchemaElement } from '../typeschema/types';
import { validationRegexes } from '../typeschema/validation';
import { capitalize, isEmpty } from '../utils';

/**
 * Returns a single element array with a typed boolean value.
 * @param value - The primitive boolean value.
 * @returns Single element array with a typed boolean value.
 */
export function booleanToTypedValue(value: boolean): [TypedValue] {
  return [{ type: PropertyType.boolean, value }];
}

/**
 * Returns a "best guess" TypedValue for a given value.
 * @param value - The unknown value to check.
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
 * @param obj - Any value or array of values.
 * @returns The converted boolean value according to FHIRPath rules.
 */
export function toJsBoolean(obj: TypedValue[]): boolean {
  return obj.length === 0 ? false : !!obj[0].value;
}

export function singleton(collection: TypedValue[], type?: string): TypedValue | undefined {
  if (collection.length === 0) {
    return undefined;
  } else if (collection.length === 1 && (!type || collection[0].type === type)) {
    return collection[0];
  } else {
    throw new Error(`Expected singleton of type ${type}, but found ${JSON.stringify(collection)}`);
  }
}

export interface GetTypedPropertyValueOptions {
  /** (optional) URL of a resource profile for type resolution */
  profileUrl?: string;
}

/**
 * Returns the value of the property and the property type.
 * Some property definitions support multiple types.
 * For example, "Observation.value[x]" can be "valueString", "valueInteger", "valueQuantity", etc.
 * According to the spec, there can only be one property for a given element definition.
 * This function returns the value and the type.
 * @param input - The base context (FHIR resource or backbone element).
 * @param path - The property path.
 * @param options - (optional) Additional options
 * @returns The value of the property and the property type.
 */
export function getTypedPropertyValue(
  input: TypedValue,
  path: string,
  options?: GetTypedPropertyValueOptions
): TypedValue[] | TypedValue | undefined {
  if (!input.value) {
    return undefined;
  }

  const elementDefinition = getElementDefinition(input.type, path, options?.profileUrl);
  if (elementDefinition) {
    return getTypedPropertyValueWithSchema(input, path, elementDefinition);
  }

  return getTypedPropertyValueWithoutSchema(input, path);
}

/**
 * Returns the value of the property and the property type using a type schema.
 * @param typedValue - The base context (FHIR resource or backbone element).
 * @param path - The property path.
 * @param element - The property element definition.
 * @returns The value of the property and the property type.
 */
export function getTypedPropertyValueWithSchema(
  typedValue: TypedValue,
  path: string,
  element: InternalSchemaElement
): TypedValue[] | TypedValue | undefined {
  // Consider the following cases of the inputs:

  // "path" input types:
  // 1. Simple path, e.g., "name"
  // 2. Choice-of-type without type, e.g., "value[x]"
  // 3. Choice-of-type with type, e.g., "valueBoolean"

  // "element" can be either:
  // 1. Full ElementDefinition from a well-formed StructureDefinition
  // 2. Partial ElementDefinition from base-schema.json

  // "types" input types:
  // 1. Simple single type, e.g., "string"
  // 2. Choice-of-type with full array of types, e.g., ["string", "integer", "Quantity"]
  // 3. Choice-of-type with single array of types, e.g., ["Quantity"]

  // Note that FHIR Profiles can define a single type for a choice-of-type element.
  // e.g. https://build.fhir.org/ig/HL7/US-Core/StructureDefinition-us-core-birthsex.html
  // Therefore, cannot only check for endsWith('[x]') since FHIRPath uses this code path
  // with a path of 'value' and expects Choice of Types treatment

  const value = typedValue.value;
  const types = element.type;
  if (!types || types.length === 0) {
    return undefined;
  }

  // The path parameter can be in both "value[x]" form and "valueBoolean" form.
  // So we need to use the element path to find the type.
  let resultValue: any = undefined;
  let resultType = 'undefined';
  let primitiveExtension: Extension[] | undefined = undefined;

  if (element.path.endsWith('[x]')) {
    const elementBasePath = (element.path.split('.').pop() as string).replace('[x]', '');
    for (const type of types) {
      const candidatePath = elementBasePath + capitalize(type.code);
      resultValue = value[candidatePath];
      primitiveExtension = value['_' + candidatePath];
      if (resultValue !== undefined || primitiveExtension !== undefined) {
        resultType = type.code;
        break;
      }
    }
  } else {
    console.assert(types.length === 1, 'Expected single type', element.path);
    resultValue = value[path];
    resultType = types[0].code;
    primitiveExtension = value['_' + path];
  }

  // When checking for primitive extensions, we must use the "resolved" path.
  // In the case of [x] choice-of-type, the type must be resolved to a single type.
  if (primitiveExtension) {
    if (Array.isArray(resultValue)) {
      // Slice to avoid mutating the array in the input value
      resultValue = resultValue.slice();
      for (let i = 0; i < Math.max(resultValue.length, primitiveExtension.length); i++) {
        resultValue[i] = assignPrimitiveExtension(resultValue[i], primitiveExtension[i]);
      }
    } else {
      resultValue = assignPrimitiveExtension(resultValue, primitiveExtension);
    }
  }

  if (isEmpty(resultValue)) {
    return undefined;
  }

  if (resultType === 'Element' || resultType === 'BackboneElement') {
    resultType = element.type[0].code;
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
 * @param typedValue - The base context (FHIR resource or backbone element).
 * @param path - The property path.
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
    //eslint-disable-next-line guard-for-in
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
 * @param arr - The input array.
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
 * @param input - The input array.
 * @returns The negated type value array.
 */
export function fhirPathNot(input: TypedValue[]): TypedValue[] {
  return booleanToTypedValue(!toJsBoolean(input));
}

/**
 * Determines if two arrays are equal according to FHIRPath equality rules.
 * @param x - The first array.
 * @param y - The second array.
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
 * Determines if two arrays are not equal according to FHIRPath equality rules.
 * @param x - The first array.
 * @param y - The second array.
 * @returns FHIRPath true if the arrays are not equal.
 */
export function fhirPathArrayNotEquals(x: TypedValue[], y: TypedValue[]): TypedValue[] {
  if (x.length === 0 || y.length === 0) {
    return [];
  }
  if (x.length !== y.length) {
    return booleanToTypedValue(true);
  }
  return booleanToTypedValue(x.some((val, index) => !toJsBoolean(fhirPathEquals(val, y[index]))));
}

/**
 * Determines if two values are equal according to FHIRPath equality rules.
 * @param x - The first value.
 * @param y - The second value.
 * @returns True if equal.
 */
export function fhirPathEquals(x: TypedValue, y: TypedValue): TypedValue[] {
  const xValue = x.value?.valueOf();
  const yValue = y.value?.valueOf();
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
 * @param x - The first array.
 * @param y - The second array.
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
 * @param x - The first value.
 * @param y - The second value.
 * @returns True if equivalent.
 */
export function fhirPathEquivalent(x: TypedValue, y: TypedValue): TypedValue[] {
  const { type: xType, value: xValueRaw } = x;
  const { type: yType, value: yValueRaw } = y;
  const xValue = xValueRaw?.valueOf();
  const yValue = yValueRaw?.valueOf();

  if (typeof xValue === 'number' && typeof yValue === 'number') {
    // Use more generous threshold than equality
    // Decimal: values must be equal, comparison is done on values rounded to the precision of the least precise operand.
    // Trailing zeroes after the decimal are ignored in determining precision.
    return booleanToTypedValue(Math.abs(xValue - yValue) < 0.01);
  }
  if (isQuantity(xValue) && isQuantity(yValue)) {
    return booleanToTypedValue(isQuantityEquivalent(xValue, yValue));
  }

  if (xType === 'Coding' && yType === 'Coding') {
    if (typeof xValue !== 'object' || typeof yValue !== 'object') {
      return booleanToTypedValue(false);
    }
    // "In addition, for Coding values, equivalence is defined based on the code and system elements only.
    // The version, display, and userSelected elements are ignored for the purposes of determining Coding equivalence."
    // Source: https://hl7.org/fhir/fhirpath.html#changes

    // We need to check if both `code` and `system` are equivalent.
    // If both have undefined `system` fields, If so, then the two's `system` values must be compared.
    // Essentially they must both be `undefined` or both the same.
    return booleanToTypedValue(
      (xValue as Coding).code === (yValue as Coding).code && (xValue as Coding).system === (yValue as Coding).system
    );
  }

  if (typeof xValue === 'object' && typeof yValue === 'object') {
    return booleanToTypedValue(deepEquals({ ...xValue, id: undefined }, { ...yValue, id: undefined }));
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
 * @param x - The first value.
 * @param y - The second value.
 * @returns The sort order of the values.
 */
function fhirPathEquivalentCompare(x: TypedValue, y: TypedValue): number {
  const xValue = x.value?.valueOf();
  const yValue = y.value?.valueOf();
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
 * @param typedValue - The typed value to check.
 * @param desiredType - The desired type name.
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
      return isDateString(value);
    case 'DateTime':
      return isDateTimeString(value);
    case 'Time':
      return typeof value === 'string' && !!/^T\d/.exec(value);
    case 'Period':
      return isPeriod(value);
    case 'Quantity':
      return isQuantity(value);
    default:
      return typeof value === 'object' && value?.resourceType === desiredType;
  }
}

/**
 * Returns true if the input value is a YYYY-MM-DD date string.
 * @param input - Unknown input value.
 * @returns True if the input is a date string.
 */
export function isDateString(input: unknown): input is string {
  return typeof input === 'string' && !!validationRegexes.date.exec(input);
}

/**
 * Returns true if the input value is a YYYY-MM-DDThh:mm:ss.sssZ date/time string.
 * @param input - Unknown input value.
 * @returns True if the input is a date/time string.
 */
export function isDateTimeString(input: unknown): input is string {
  return typeof input === 'string' && !!validationRegexes.dateTime.exec(input);
}

/**
 * Determines if the input is a Period object.
 * This is heuristic based, as we do not have strong typing at runtime.
 * @param input - The input value.
 * @returns True if the input is a period.
 */
export function isPeriod(input: unknown): input is Period {
  return !!(
    input &&
    typeof input === 'object' &&
    (('start' in input && isDateTimeString(input.start)) || ('end' in input && isDateTimeString(input.end)))
  );
}

/**
 * Tries to convert an unknown input value to a Period object.
 * @param input - Unknown input value.
 * @returns A Period object or undefined.
 */
export function toPeriod(input: unknown): Period | undefined {
  if (!input) {
    return undefined;
  }

  if (isDateString(input)) {
    return {
      start: dateStringToInstantString(input, '0000-00-00T00:00:00.000Z'),
      end: dateStringToInstantString(input, 'xxxx-12-31T23:59:59.999Z'),
    };
  }

  if (isDateTimeString(input)) {
    return { start: input, end: input };
  }

  if (isPeriod(input)) {
    return input;
  }

  return undefined;
}

function dateStringToInstantString(input: string, fill: string): string {
  // Input can be any subset of YYYY-MM-DDThh:mm:ss.sssZ
  return input + fill.substring(input.length);
}

/**
 * Determines if the input is a Quantity object.
 * This is heuristic based, as we do not have strong typing at runtime.
 * @param input - The input value.
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
 * @param object1 - The first object.
 * @param object2 - The second object.
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
    } else if (val1 !== val2) {
      return false;
    }
  }
  return true;
}

function isObject(obj: unknown): obj is object {
  return obj !== null && typeof obj === 'object';
}

function assignPrimitiveExtension(target: any, primitiveExtension: any): any {
  if (primitiveExtension) {
    if (typeof primitiveExtension !== 'object') {
      throw new Error('Primitive extension must be an object');
    }
    return safeAssign(target ?? {}, primitiveExtension);
  }
  return target;
}

/**
 * For primitive string, number, boolean, the return value will be the corresponding
 * `String`, `Number`, or `Boolean` version of the type.
 * @param target - The value to have `source` properties assigned to.
 * @param source - An object to be assigned to `target`.
 * @returns The `target` value with the properties of `source` assigned to it.
 */
function safeAssign(target: any, source: any): any {
  delete source.__proto__; //eslint-disable-line no-proto
  delete source.constructor;
  return Object.assign(target, source);
}
