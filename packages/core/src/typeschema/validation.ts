import { OperationOutcomeIssue, Resource, StructureDefinition } from '@medplum/fhirtypes';
import { getDataType, parseStructureDefinition } from './types';
import { InternalTypeSchema } from './types';
import { OperationOutcomeError, validationError } from '../outcomes';
import { PropertyType, TypedValue } from '../types';
import { getTypedPropertyValue } from '../fhirpath';
import { createStructureIssue } from '../schema';
import { isEmpty, isLowerCase } from '../utils';

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
    // Detect extraneous properties in a single pass by keeping track of all keys that were correctly matched to resource properties
    // const keys = Object.fromEntries(Object.entries(value.value).map(([k, _]) => [k, true]));

    for (const [key, _propSchema] of Object.entries(schema.fields)) {
      this.checkProperty(value, key, schema, path + '.' + key);
    }

    //@TODO: Check for extraneous properties
  }

  private checkProperty(value: TypedValue, key: string, schema: InternalTypeSchema, path: string): void {
    const property = getTypedPropertyValue(value, key);
    if (property === null) {
      this.issues.push(createStructureIssue(path, 'Invalid null value'));
      return;
    }

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

  private checkPropertyValue(value: TypedValue, path: string): void {
    if (isLowerCase(value.type.charAt(0))) {
      this.validatePrimitiveType(value, path);
    } else {
      // Recursively validate as the expected data type
      const type = getDataType(value.type);
      this.validateObject(value, type, path);
    }
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
