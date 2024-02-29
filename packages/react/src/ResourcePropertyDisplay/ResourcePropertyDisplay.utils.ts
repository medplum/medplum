import {
  getTypedPropertyValue,
  getTypedPropertyValueWithSchema,
  InternalSchemaElement,
  TypedValue,
} from '@medplum/core';

/**
 * Returns the value of the property and the property type.
 * Some property definitions support multiple types.
 * For example, "Observation.value[x]" can be "valueString", "valueInteger", "valueQuantity", etc.
 * According to the spec, there can only be one property for a given element definition.
 * This function returns the value and the type.
 * @param context - The base context (usually a FHIR resource).
 * @param path - The property path.
 * @param profileUrl - The property path.
 * @returns The value of the property and the property type.
 */
export function getValueAndType(context: TypedValue, path: string, profileUrl?: string): [any, string] {
  const typedResult = getTypedPropertyValue(context, path, { profileUrl });
  if (!typedResult) {
    return [undefined, 'undefined'];
  }

  if (Array.isArray(typedResult)) {
    return [typedResult.map((e) => e.value), typedResult[0].type];
  }

  return [typedResult.value, typedResult.type];
}

/**
 * Returns the value of the property and the property type.
 * Some property definitions support multiple types.
 * For example, "Observation.value[x]" can be "valueString", "valueInteger", "valueQuantity", etc.
 * According to the spec, there can only be one property for a given element definition.
 * This function returns the value and the type.
 * @param typedValue - The base context (usually a FHIR resource).
 * @param path - The property path.
 * @param element - The property element definition.
 * @returns The value of the property and the property type.
 */
export function getValueAndTypeFromElement(
  typedValue: TypedValue,
  path: string,
  element: InternalSchemaElement
): [any, string] {
  const typedResult = getTypedPropertyValueWithSchema(typedValue, path, element);
  if (!typedResult) {
    return [undefined, 'undefined'];
  }

  if (Array.isArray(typedResult)) {
    return [typedResult.map((e) => e.value), typedResult[0].type];
  }

  return [typedResult.value, typedResult.type];
}
