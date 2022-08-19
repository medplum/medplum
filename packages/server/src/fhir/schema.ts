import {
  getTypedPropertyValue,
  IndexedStructureDefinition,
  isEmpty,
  isLowerCase,
  OperationOutcomeError,
  PropertyType,
  toTypedValue,
  TypedValue,
} from '@medplum/core';
import { ElementDefinition, OperationOutcomeIssue, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { getStructureDefinitions } from './structure';
import { checkForNull, createStructureIssue, validationError } from './utils';

/*
 * The regular expressions for FHIR primitives in JSON strings.
 * Based on the official regular expression in packages/definitions/dist/fhir/r4/profiles-types.json
 * Added '^' and '$' for start of line and end of line.
 */

const BASE64_BINARY_REGEX = /^[a-zA-Z0-9+/]*={0,2}$/;
const DATE_REGEX =
  /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1]))?)?$/;
const DATE_TIME_REGEX =
  /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?)?)?$/;
const ID_REGEX = /^[A-Za-z0-9\-.]{1,64}$/;
const INSTANT_REGEX =
  /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$/;
const OID_REGEX = /^urn:oid:[0-2](\.(0|[1-9][0-9]*))+$/;
const TIME_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?$/;
const UUID_REGEX = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isResourceType(resourceType: string): boolean {
  const typeSchema = getStructureDefinitions().types[resourceType];
  return (
    typeSchema &&
    typeSchema.structureDefinition.id === resourceType &&
    typeSchema.structureDefinition.kind === 'resource'
  );
}

export function validateResourceType(resourceType: string): void {
  if (!resourceType) {
    throw validationError('Resource type is null');
  }
  if (!isResourceType(resourceType)) {
    throw validationError('Unknown resource type');
  }
}

export function validateResource<T extends Resource>(resource: T): void {
  new FhirSchemaValidator(resource).validate();
}

export class FhirSchemaValidator<T extends Resource> {
  readonly #schema: IndexedStructureDefinition;
  readonly #issues: OperationOutcomeIssue[];
  readonly #root: T;

  constructor(root: T) {
    this.#schema = getStructureDefinitions();
    this.#issues = [];
    this.#root = root;
  }

  validate(): void {
    const resource = this.#root;
    if (!resource) {
      throw validationError('Resource is null');
    }

    const resourceType = resource.resourceType;
    if (!resourceType) {
      throw validationError('Missing resource type');
    }

    this.#validateObject(toTypedValue(resource), '');

    if (this.#issues.length > 0) {
      throw new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        id: randomUUID(),
        issue: this.#issues,
      });
    }
  }

  #validateObject(typedValue: TypedValue, path: string): void {
    const definition = this.#schema.types[typedValue.type];
    if (!definition) {
      throw validationError('Unknown type: ' + typedValue.type);
    }

    const object = typedValue.value as Record<string, unknown>;
    const propertyDefinitions = definition.properties;

    checkForNull(object, path, this.#issues);
    this.#checkProperties(typedValue, propertyDefinitions);
    this.#checkAdditionalProperties(object, propertyDefinitions);
  }

  #checkProperties(typedValue: TypedValue, propertyDefinitions: Record<string, ElementDefinition>): void {
    for (const elementDefinition of Object.values(propertyDefinitions)) {
      this.#checkProperty(typedValue, elementDefinition);
    }
  }

  #checkProperty(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    const path = elementDefinition.path as string;
    const propertyName = path.split('.').pop() as string;
    const value = getTypedPropertyValue(typedValue, propertyName);

    if (isEmpty(value)) {
      if (elementDefinition.min !== undefined && elementDefinition.min > 0) {
        this.#issues.push(createStructureIssue(path, `Missing required property "${path}"`));
      }
      return;
    }

    if (elementDefinition.max === '*') {
      if (!Array.isArray(value)) {
        this.#issues.push(createStructureIssue(path, `Expected array for property "${path}"`));
        return;
      }
      for (const item of value) {
        this.#checkPropertyValue(item, elementDefinition);
      }
    } else {
      this.#checkPropertyValue(value as TypedValue, elementDefinition);
    }
  }

  #checkPropertyValue(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (isLowerCase(typedValue.type.charAt(0))) {
      this.#validatePrimitiveType(typedValue, elementDefinition);
    }
  }

  #validatePrimitiveType(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    switch (typedValue.type) {
      case PropertyType.base64Binary:
        this.#validateBase64Binary(typedValue, elementDefinition);
        break;
      case PropertyType.boolean:
        this.#validateBoolean(typedValue, elementDefinition);
        break;
      case PropertyType.date:
        this.#validateDate(typedValue, elementDefinition);
        break;
      case PropertyType.dateTime:
        this.#validateDateTime(typedValue, elementDefinition);
        break;
      case PropertyType.decimal:
        this.#validateDecimal(typedValue, elementDefinition);
        break;
      case PropertyType.id:
        this.#validateId(typedValue, elementDefinition);
        break;
      case PropertyType.instant:
        this.#validateInstant(typedValue, elementDefinition);
        break;
      case PropertyType.integer:
        this.#validateInteger(typedValue, elementDefinition);
        break;
      case PropertyType.oid:
        this.#validateOid(typedValue, elementDefinition);
        break;
      case PropertyType.positiveInt:
        this.#validatePositiveInt(typedValue, elementDefinition);
        break;
      case PropertyType.canonical:
      case PropertyType.code:
      case PropertyType.markdown:
      case PropertyType.string:
      case PropertyType.uri:
      case PropertyType.url:
      case PropertyType.SystemString:
        this.#validateString(typedValue, elementDefinition);
        break;
      case PropertyType.time:
        this.#validateTime(typedValue, elementDefinition);
        break;
      case PropertyType.unsignedInt:
        this.#validateUnsignedInt(typedValue, elementDefinition);
        break;
      case PropertyType.uuid:
        this.#validateUuid(typedValue, elementDefinition);
        break;
    }
  }

  #validateBase64Binary(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    if (!typedValue.value.match(BASE64_BINARY_REGEX)) {
      this.#createIssue(elementDefinition, 'Invalid base64Binary format');
    }
  }

  #validateBoolean(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (typeof typedValue.value !== 'boolean') {
      this.#createIssue(elementDefinition, 'Invalid type for boolean');
    }
  }

  #validateDate(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    if (!typedValue.value.match(DATE_REGEX)) {
      this.#createIssue(elementDefinition, 'Invalid date format');
    }
  }

  #validateDateTime(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    if (!typedValue.value.match(DATE_TIME_REGEX)) {
      this.#createIssue(elementDefinition, 'Invalid dateTime format');
    }
  }

  #validateDecimal(typedValue: TypedValue, elementDefinition: ElementDefinition): boolean {
    if (typeof typedValue.value !== 'number') {
      this.#createIssue(elementDefinition, 'Invalid type for ' + typedValue.type);
      return false;
    }
    if (isNaN(typedValue.value) || !isFinite(typedValue.value)) {
      this.#createIssue(elementDefinition, 'Invalid ' + typedValue.type + ' value');
      return false;
    }
    return true;
  }

  #validateId(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    if (!typedValue.value.match(ID_REGEX)) {
      this.#createIssue(elementDefinition, 'Invalid id format');
    }
  }

  #validateInstant(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    if (!typedValue.value.match(INSTANT_REGEX)) {
      this.#createIssue(elementDefinition, 'Invalid instant format');
    }
  }

  #validateInteger(typedValue: TypedValue, elementDefinition: ElementDefinition): boolean {
    if (!this.#validateDecimal(typedValue, elementDefinition)) {
      return false;
    }
    if (!Number.isInteger(typedValue.value)) {
      this.#createIssue(elementDefinition, 'Number is not an integer');
      return false;
    }
    return true;
  }

  #validateOid(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    if (!typedValue.value.match(OID_REGEX)) {
      this.#createIssue(elementDefinition, 'Invalid oid format');
    }
  }

  #validatePositiveInt(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateInteger(typedValue, elementDefinition)) {
      return;
    }
    if (typedValue.value <= 0) {
      this.#createIssue(elementDefinition, 'Number is less than or equal to zero');
    }
  }

  #validateString(typedValue: TypedValue, elementDefinition: ElementDefinition): boolean {
    if (typeof typedValue.value !== 'string') {
      this.#createIssue(elementDefinition, 'Invalid type for ' + typedValue.type);
      return false;
    }
    if (typedValue.value.trim() === '') {
      this.#createIssue(elementDefinition, 'Invalid empty string for ' + typedValue.type);
      return false;
    }
    return true;
  }

  #validateTime(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    if (!typedValue.value.match(TIME_REGEX)) {
      this.#createIssue(elementDefinition, 'Invalid time format');
    }
  }

  #validateUnsignedInt(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateInteger(typedValue, elementDefinition)) {
      return;
    }
    if (typedValue.value < 0) {
      this.#createIssue(elementDefinition, 'Number is negative');
    }
  }

  #validateUuid(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    if (!typedValue.value.match(UUID_REGEX)) {
      this.#createIssue(elementDefinition, 'Invalid uuid format');
    }
  }

  #checkAdditionalProperties(
    object: Record<string, unknown>,
    propertyDefinitions: Record<string, ElementDefinition>
  ): void {
    for (const key of Object.keys(object)) {
      if (key === 'resourceType' || key === 'id' || key === 'meta' || key === '_baseDefinition') {
        continue;
      }
      if (!(key in propertyDefinitions)) {
        // Try to find a "choice of type" property (e.g., "value[x]")
        // TODO: Consolidate this logic with FHIRPath lookup
        const choiceOfTypeKey = key.replace(/[A-Z].+/, '[x]');
        if (!(choiceOfTypeKey in propertyDefinitions)) {
          this.#issues.push(createStructureIssue(key, `Invalid additional property "${key}"`));
        }
      }
    }
  }

  #createIssue(elementDefinition: ElementDefinition, message: string): void {
    this.#issues.push(createStructureIssue(elementDefinition.path as string, message));
  }
}
