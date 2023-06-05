import { OperationOutcomeIssue, Resource, StructureDefinition } from '@medplum/fhirtypes';
import { ElementValidator, getDataType, parseStructureDefinition } from './types';
import { InternalTypeSchema } from './types';
import { OperationOutcomeError, validationError } from '../outcomes';
import { PropertyType, TypedValue } from '../types';
import { getTypedPropertyValue } from '../fhirpath';
import { createStructureIssue } from '../schema';
import { capitalize, isEmpty, isLowerCase } from '../utils';

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
  base64Binary: /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  canonical: /^\S*$/,
  code: /^[^\s]+( [^\s]+)*$/,
  date: /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1]))?)?$/,
  dateTime:
    /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]{1,9})?)?)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00)?)?)?$/,
  id: /^[A-Za-z0-9\-.]{1,64}$/,
  instant:
    /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]{1,9})?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$/,
  markdown: /^[\s\S]+$/,
  oid: /^urn:oid:[0-2](\.(0|[1-9][0-9]*))+$/,
  string: /^[\s\S]+$/,
  time: /^([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]{1,9})?$/,
  uri: /^\S*^/,
  url: /^\S*^/,
  uuid: /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  xhtml: /.*/,
};

export function validateResource(resource: Resource, profile: StructureDefinition): void {
  return new ResourceValidator(profile).validate(resource);
}

class ResourceValidator {
  private issues: OperationOutcomeIssue[];
  private readonly schema: InternalTypeSchema;

  constructor(profile: StructureDefinition) {
    this.issues = [];
    this.schema = parseStructureDefinition(profile);
  }

  validate(resource: Resource): void {
    if (!resource) {
      throw new OperationOutcomeError(validationError('Resource is null'));
    }
    const resourceType = resource.resourceType;
    if (!resourceType) {
      throw new OperationOutcomeError(validationError('Missing resource type'));
    }

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

  private validateObject(value: TypedValue, schema: InternalTypeSchema, path: string): void {
    for (const [key, _propSchema] of Object.entries(schema.fields)) {
      this.checkProperty(value, key, schema, path + '.' + key);
    }

    //@TODO(mattwiller 2023-06-05): Detect extraneous properties in a single pass by keeping track of all keys that
    // were correctly matched to resource properties as elements are validated above
    this.checkAdditionalProperties(value, schema.fields, path);
  }

  private checkProperty(value: TypedValue, key: string, schema: InternalTypeSchema, path: string): void {
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
    for (const property of propertyValues) {
      const element = schema.fields[key];
      if (!element) {
        throw new Error(`Missing element validation schema for ${key}`);
      }

      if (isEmpty(property)) {
        if (element.min > 0) {
          this.issues.push(createStructureIssue(path, 'Missing required property'));
        }
        return;
      }

      let values: TypedValue[];
      if (element.isArray) {
        if (!Array.isArray(property)) {
          this.issues.push(createStructureIssue(path, 'Expected array of values'));
          return;
        }
        values = property;
      } else {
        if (Array.isArray(property)) {
          this.issues.push(createStructureIssue(path, 'Expected single value'));
          return;
        }
        values = [property as TypedValue];
      }
      for (const value of values) {
        this.checkPropertyValue(value, path);
      }
    }
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
    typedValue: TypedValue,
    properties: Record<string, ElementValidator>,
    path: string
  ): void {
    const object = typedValue.value as Record<string, unknown>;
    for (const key of Object.keys(object)) {
      if (key === 'resourceType') {
        continue; // Skip special resource type discriminator property in JSON
      }
      if (
        !(key in properties) &&
        !isChoiceOfType(typedValue, key, properties) &&
        !this.checkPrimitiveProperty(typedValue, key, path)
      ) {
        const expression = `${path}.${key}`;
        this.issues.push(createStructureIssue(expression, `Invalid additional property "${expression}"`));
      }
    }
  }

  /**
   * Checks the element for a primitive.
   *
   * FHIR elements with primitive data types are represented in two parts:
   *   1) A JSON property with the name of the element, which has a JSON type of number, boolean, or string
   *   2) a JSON property with _ prepended to the name of the element, which, if present, contains the value's id and/or extensions
   *
   * See: https://hl7.org/fhir/json.html#primitive
   *
   * @param path The path to the property
   * @param key
   * @param typedValue
   */
  private checkPrimitiveProperty(typedValue: TypedValue, key: string, path: string): boolean {
    // Primitive element starts with underscore
    if (!key.startsWith('_')) {
      return false;
    }

    // Validate the non-underscore property exists
    const primitiveKey = key.slice(1);
    if (!(primitiveKey in typedValue.value)) {
      return false;
    }

    // Then validate the element
    //@TODO(mattwiller 2023-06-05): Move this to occur along with the rest of validation
    this.validateObject({ type: 'Element', value: typedValue.value[key] }, getDataType('Element'), path);
    return true;
  }

  private validatePrimitiveType(typedValue: TypedValue, path: string): void {
    const { type, value } = typedValue;

    // First, make sure the value is the correct JS type
    const expectedType = fhirTypeToJsType[type];
    if (typeof value !== expectedType) {
      this.issues.push(
        createStructureIssue(path, `Invalid JSON type at ${path}: expected ${expectedType}, but got ${typeof value}`)
      );
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
    if (regex && !str.match(regex)) {
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
  for (const propertyName of Object.keys(propertyDefinitions)) {
    if (!propertyName.endsWith('[x]')) {
      continue;
    }
    const basePropertyName = propertyName.replace('[x]', '');
    if (!key.startsWith(basePropertyName)) {
      continue;
    }
    let typedPropertyValue = getTypedPropertyValue(typedValue, propertyName);
    if (!typedPropertyValue) {
      continue;
    }
    if (Array.isArray(typedPropertyValue)) {
      // At present, there are no choice types that are arrays in the FHIR spec
      // Leaving this here to make TypeScript happy, and in case that changes
      typedPropertyValue = typedPropertyValue[0];
    }
    if (typedPropertyValue && key === basePropertyName + capitalize(typedPropertyValue.type)) {
      return true;
    }
  }
  return false;
}
