import { OperationOutcomeIssue, Resource, StructureDefinition } from '@medplum/fhirtypes';
import {
  ElementValidator,
  getDataType,
  parseStructureDefinition,
  InternalTypeSchema,
  SliceDefinition,
  SliceDiscriminator,
} from './types';
import { OperationOutcomeError, serverError, validationError } from '../outcomes';
import { PropertyType, TypedValue } from '../types';
import { getTypedPropertyValue } from '../fhirpath';
import { createStructureIssue } from '../schema';
import { arrayify, deepEquals, deepIncludes, isEmpty, isLowerCase } from '../utils';

/*
 * This file provides schema validation utilities for FHIR JSON objects.
 *
 * See: [JSON Representation of Resources](https://hl7.org/fhir/json.html)
 * See: [FHIR Data Types](https://www.hl7.org/fhir/datatypes.html)
 */
const fhirTypeToJsType: Record<string, string> = {
  base64Binary: 'string',
  boolean: 'boolean',
  canonical: 'string',
  code: 'string',
  date: 'string',
  dateTime: 'string',
  decimal: 'number',
  id: 'string',
  instant: 'string',
  integer: 'number',
  markdown: 'string',
  oid: 'string',
  positiveInt: 'number',
  string: 'string',
  time: 'string',
  unsignedInt: 'number',
  uri: 'string',
  url: 'string',
  uuid: 'string',
  xhtml: 'string',
  'http://hl7.org/fhirpath/System.String': 'string', // Not actually a FHIR type, but included in some StructureDefinition resources
};

/*
 * This file provides schema validation utilities for FHIR JSON objects.
 *
 * See: [JSON Representation of Resources](https://hl7.org/fhir/json.html)
 * See: [FHIR Data Types](https://www.hl7.org/fhir/datatypes.html)
 */
const validationRegexes: Record<string, RegExp> = {
  base64Binary: /^([A-Za-z\d+/]{4})*([A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/,
  canonical: /^\S*$/,
  code: /^[^\s]+( [^\s]+)*$/,
  date: /^(\d(\d(\d[1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2]\d|3[0-1]))?)?$/,
  dateTime:
    /^(\d(\d(\d[1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2]\d|3[0-1])(T([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d{1,9})?)?)?(Z|[+-]((0\d|1[0-3]):[0-5]\d|14:00)?)?)?$/,
  id: /^[A-Za-z0-9\-.]{1,64}$/,
  instant:
    /^(\d(\d(\d[1-9]|[1-9]0)|[1-9]00)|[1-9]000)-(0[1-9]|1[0-2])-(0[1-9]|[1-2]\d|3[0-1])T([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d{1,9})?(Z|[+-]((0\d|1[0-3]):[0-5]\d|14:00))$/,
  markdown: /^[\s\S]+$/,
  oid: /^urn:oid:[0-2](\.(0|[1-9]\d*))+$/,
  string: /^[\s\S]+$/,
  time: /^([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d{1,9})?$/,
  uri: /^\S*$/,
  url: /^\S*$/,
  uuid: /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  xhtml: /.*/,
};

export function validateResource(resource: Resource, profile?: StructureDefinition): void {
  return new ResourceValidator(resource.resourceType, profile).validate(resource);
}

class ResourceValidator {
  private issues: OperationOutcomeIssue[];
  private readonly schema: InternalTypeSchema;

  constructor(resourceType: string, profile?: StructureDefinition) {
    this.issues = [];
    if (!profile) {
      this.schema = getDataType(resourceType);
    } else {
      this.schema = parseStructureDefinition(profile);
    }
  }

  validate(resource: Resource): void {
    if (!resource) {
      throw new OperationOutcomeError(validationError('Resource is null'));
    }
    const resourceType = resource.resourceType;
    if (!resourceType) {
      throw new OperationOutcomeError(validationError('Missing resource type'));
    }

    checkObjectForNull(resource as unknown as Record<string, unknown>, resource.resourceType, this.issues);

    this.validateObject({ type: resourceType, value: resource }, this.schema, resourceType);

    const issues = this.issues;
    this.issues = []; // Reset issues to allow re-using the validator for other resources
    if (issues.length > 0) {
      throw new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        issue: issues,
      });
    }
  }

  private validateObject(obj: TypedValue, schema: InternalTypeSchema, path: string): void {
    for (const [key, _propSchema] of Object.entries(schema.fields)) {
      this.checkProperty(obj, key, schema, `${path}.${key}`);
    }

    //@TODO(mattwiller 2023-06-05): Detect extraneous properties in a single pass by keeping track of all keys that
    // were correctly matched to resource properties as elements are validated above
    this.checkAdditionalProperties(obj, schema.fields, path);
  }

  private checkProperty(parent: TypedValue, key: string, schema: InternalTypeSchema, path: string): void {
    const propertyValues = getNestedProperty(parent, key);
    const element = schema.fields[key];
    if (!element) {
      throw new Error(`Missing element validation schema for ${key}`);
    }
    for (const value of propertyValues) {
      if (!this.checkPresence(value, element, path)) {
        return;
      }

      // Check cardinality
      let values: TypedValue[];
      if (element.isArray) {
        if (!Array.isArray(value)) {
          this.issues.push(createStructureIssue(path, 'Expected array of values for property'));
          return;
        }
        values = value;
      } else {
        if (Array.isArray(value)) {
          this.issues.push(createStructureIssue(path, 'Expected single value for property'));
          return;
        }
        values = [value];
      }
      if (values.length < element.min || values.length > element.max) {
        this.issues.push(
          createStructureIssue(
            path,
            `Invalid number of values: expected ${element.min}..${
              Number.isFinite(element.max) ? element.max : '*'
            }, but found ${values.length}`
          )
        );
      }

      if (!matchesSpecifiedValue(value, element)) {
        this.issues.push(createStructureIssue(path, 'Value did not match expected pattern'));
      }
      const sliceCounts: Record<string, number> = Object.fromEntries(
        element.slicing?.slices.map((s) => [s.name, 0]) ?? []
      );
      nextValue: for (const value of values) {
        this.checkPropertyValue(value, path);
        if (element.slicing) {
          nextSlice: for (const slice of element.slicing.slices) {
            for (const discriminator of element.slicing.discriminator) {
              const discrimValues = arrayify(getNestedProperty(value, discriminator.path));
              if (!discrimValues) {
                continue nextValue;
              }
              if (!discrimValues.some((v) => matchDiscriminant(v, discriminator, slice))) {
                continue nextSlice;
              }
            }
            sliceCounts[slice.name] += 1;
          }
        }
      }
      for (const slice of element.slicing?.slices ?? []) {
        const sliceCardinality = sliceCounts[slice.name];
        if (sliceCardinality < slice.min || sliceCardinality > slice.max) {
          this.issues.push(
            createStructureIssue(
              path,
              `Incorrect number of values provided for slice '${slice.name}': expected ${slice.min}..${
                Number.isFinite(slice.max) ? slice.max : '*'
              }, but found ${sliceCardinality}`
            )
          );
        }
      }
    }
  }

  private checkPresence(
    value: TypedValue | TypedValue[] | undefined,
    element: ElementValidator,
    path: string
  ): value is TypedValue | TypedValue[] {
    if (value === undefined) {
      if (element.min > 0) {
        this.issues.push(createStructureIssue(path, 'Missing required property'));
      }
      return false;
    } else if (isEmpty(value)) {
      this.issues.push(createStructureIssue(path, 'Invalid empty value'));
      return false;
    }
    return true;
  }

  private checkPropertyValue(value: TypedValue, path: string): void {
    if (isLowerCase(value.type.charAt(0))) {
      this.validatePrimitiveType(value, path);
    } else {
      // Recursively validate as the expected data type
      const type = getDataType(value.type);
      this.validateObject(value, type, path);
    }
  }

  private checkAdditionalProperties(
    parent: TypedValue,
    properties: Record<string, ElementValidator>,
    path: string
  ): void {
    const object = parent.value as Record<string, unknown>;
    for (const key of Object.keys(object ?? {})) {
      if (key === 'resourceType') {
        continue; // Skip special resource type discriminator property in JSON
      }
      if (
        !(key in properties) &&
        !(key.slice(1) in properties && this.isPrimitiveExtension(parent, key, path)) &&
        !isChoiceOfType(parent, key, properties)
      ) {
        this.issues.push(createStructureIssue(`${path}.${key}`, `Invalid additional property "${key}"`));
      }
    }
  }

  /**
   * Checks the element for a primitive extension.
   *
   * FHIR elements with primitive data types are represented in two parts:
   *   1) A JSON property with the name of the element, which has a JSON type of number, boolean, or string
   *   2) a JSON property with _ prepended to the name of the element, which, if present, contains the value's id and/or extensions
   *
   * See: https://hl7.org/fhir/json.html#primitive
   * @param parent The parent value
   * @param key The property key to check
   * @param path The path to the property
   * @returns Whether the element is a primitive extension
   */
  private isPrimitiveExtension(parent: TypedValue, key: string, path: string): boolean {
    // Primitive element starts with underscore
    if (!key.startsWith('_')) {
      return false;
    }

    // Then validate the element
    //@TODO(mattwiller 2023-06-05): Move this to occur along with the rest of validation
    const extensionProperty = parent.value[key];
    if (Array.isArray(extensionProperty)) {
      for (const ext of extensionProperty) {
        this.validateObject({ type: 'Element', value: ext }, getDataType('Element'), path);
      }
    } else {
      this.validateObject({ type: 'Element', value: extensionProperty }, getDataType('Element'), path);
    }
    return true;
  }

  private validatePrimitiveType(typedValue: TypedValue, path: string): void {
    const { type, value } = typedValue;

    // First, make sure the value is the correct JS type
    const expectedType = fhirTypeToJsType[type];
    if (typeof value !== expectedType) {
      if (value !== null) {
        this.issues.push(
          createStructureIssue(path, `Invalid JSON type: expected ${expectedType}, but got ${typeof value}`)
        );
      }
      return;
    }

    // Then, perform additional checks for specialty types
    if (expectedType === 'string') {
      this.validateString(value as string, type as PropertyType, path);
    } else if (expectedType === 'number') {
      this.validateNumber(value as number, type as PropertyType, path);
    }
  }

  private validateString(str: string, type: PropertyType, path: string): void {
    if (!str.trim()) {
      this.issues.push(createStructureIssue(path, 'String must contain non-whitespace content'));
      return;
    }

    const regex = validationRegexes[type];
    if (regex && !regex.exec(str)) {
      this.issues.push(createStructureIssue(path, 'Invalid ' + type + ' format'));
    }
  }

  private validateNumber(n: number, type: PropertyType, path: string): void {
    if (isNaN(n) || !isFinite(n)) {
      this.issues.push(createStructureIssue(path, 'Invalid numeric value'));
    } else if (isIntegerType(type) && !Number.isInteger(n)) {
      this.issues.push(createStructureIssue(path, 'Expected number to be an integer'));
    } else if (type === PropertyType.positiveInt && n <= 0) {
      this.issues.push(createStructureIssue(path, 'Expected number to be positive'));
    } else if (type === PropertyType.unsignedInt && n < 0) {
      this.issues.push(createStructureIssue(path, 'Expected number to be non-negative'));
    }
  }
}

function isIntegerType(propertyType: PropertyType): boolean {
  return (
    propertyType === PropertyType.integer ||
    propertyType === PropertyType.positiveInt ||
    propertyType === PropertyType.unsignedInt
  );
}

function isChoiceOfType(
  typedValue: TypedValue,
  key: string,
  propertyDefinitions: Record<string, ElementValidator>
): boolean {
  const parts = key.split(/(?=[A-Z])/g); // Split before capital letters
  let testProperty = '';
  for (const part of parts) {
    testProperty += part;
    if (!propertyDefinitions[testProperty + '[x]']) {
      continue;
    }
    const typedPropertyValue = getTypedPropertyValue(typedValue, testProperty);
    return !!typedPropertyValue;
  }
  return false;
}

function getNestedProperty(value: TypedValue, key: string): (TypedValue | TypedValue[] | undefined)[] {
  const [firstProp, ...nestedProps] = key.split('.');
  let propertyValues = [getTypedPropertyValue(value, firstProp)];
  for (const prop of nestedProps) {
    const next = [];
    for (const current of propertyValues) {
      if (current === undefined) {
        continue;
      } else if (Array.isArray(current)) {
        for (const element of current) {
          next.push(getTypedPropertyValue(element, prop));
        }
      } else {
        next.push(getTypedPropertyValue(current, prop));
      }
    }
    propertyValues = next;
  }
  return propertyValues;
}

function checkObjectForNull(obj: Record<string, unknown>, path: string, issues: OperationOutcomeIssue[]): void {
  for (const [key, value] of Object.entries(obj)) {
    const propertyPath = `${path}.${key}`;
    const partnerKey = key.startsWith('_') ? key.slice(1) : `_${key}`;
    if (value === null) {
      issues.push(createStructureIssue(propertyPath, 'Invalid null value'));
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (value[i] === undefined) {
          issues.push(createStructureIssue(`${propertyPath}[${i}]`, 'Invalid undefined value'));
        } else if (value[i] === null && !(obj[partnerKey] as any)?.[i]) {
          // This tests for the one case where `null` is allowed in FHIR JSON, where an array of primitive values
          // has extensions for some but not all values
          issues.push(createStructureIssue(`${propertyPath}[${i}]`, 'Invalid null value'));
        } else if (value[i]) {
          checkObjectForNull(value[i], `${propertyPath}[${i}]`, issues);
        }
      }
    } else if (typeof value === 'object') {
      checkObjectForNull(value as Record<string, unknown>, propertyPath, issues);
    }
  }
}

function matchesSpecifiedValue(value: TypedValue | TypedValue[], element: ElementValidator): boolean {
  if (element.pattern && !deepIncludes(value, element.pattern)) {
    return false;
  } else if (element.fixed && !deepEquals(value, element.fixed)) {
    return false;
  }
  return true;
}

function matchDiscriminant(
  value: TypedValue | TypedValue[] | undefined,
  discriminator: SliceDiscriminator,
  slice: SliceDefinition
): boolean {
  const element = slice.fields[discriminator.path];
  switch (discriminator.type) {
    case 'value':
    case 'pattern':
      if (!element) {
        throw new OperationOutcomeError(
          serverError(new Error(`Failed to match slicing discriminator at ${discriminator.path}`))
        );
      } else if (!value) {
        return false;
      } else if (matchesSpecifiedValue(value, element)) {
        return true;
      }
      break;
    case 'exists':
      if (slice.min === 0 && slice.max === 0 && !value) {
        return true;
      } else if (slice.min > 0 && value) {
        return true;
      }
      break;
    case 'type':
      break;
  }
  // Default to no match
  return false;
}
