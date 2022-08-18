import {
  getTypedPropertyValue,
  IndexedStructureDefinition,
  isEmpty,
  isLowerCase,
  OperationOutcomeError,
  toTypedValue,
  TypedValue,
} from '@medplum/core';
import { ElementDefinition, OperationOutcomeIssue, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { getStructureDefinitions } from './structure';
import { checkForNull, createStructureIssue, validationError } from './utils';

export function getResourceTypes(): string[] {
  return Object.keys(getStructureDefinitions().types);
}

export function isResourceType(resourceType: string): boolean {
  return resourceType in getStructureDefinitions().types;
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
      case 'base64Binary':
        this.#validateBase64Binary(typedValue, elementDefinition);
        break;
      case 'boolean':
        this.#validateBoolean(typedValue, elementDefinition);
        break;
      case 'date':
        this.#validateDate(typedValue, elementDefinition);
        break;
      case 'dateTime':
        this.#validateDateTime(typedValue, elementDefinition);
        break;
      case 'decimal':
        this.#validateDecimal(typedValue, elementDefinition);
        break;
      case 'id':
        this.#validateId(typedValue, elementDefinition);
        break;
      case 'instant':
        this.#validateInstant(typedValue, elementDefinition);
        break;
      case 'integer':
        this.#validateInteger(typedValue, elementDefinition);
        break;
      case 'oid':
        this.#validateOid(typedValue, elementDefinition);
        break;
      case 'positiveInt':
        this.#validatePositiveInt(typedValue, elementDefinition);
        break;
      case 'canonical':
      case 'code':
      case 'markdown':
      case 'string':
      case 'uri':
      case 'url':
      case 'http://hl7.org/fhirpath/System.String':
        this.#validateString(typedValue, elementDefinition);
        break;
      case 'time':
        this.#validateTime(typedValue, elementDefinition);
        break;
      case 'unsignedInt':
        this.#validateUnsignedInt(typedValue, elementDefinition);
        break;
      case 'uuid':
        this.#validateUuid(typedValue, elementDefinition);
        break;
      default:
        this.#createIssue(elementDefinition, 'Invalid primitive type');
    }
  }

  #validateBase64Binary(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    if (!typedValue.value.match(/[a-zA-Z0-9+/]*={0,2}$/)) {
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
    const regex = new RegExp(
      '([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1]))?)?'
    );
    if (!typedValue.value.match(regex)) {
      this.#createIssue(elementDefinition, 'Invalid date format');
      return;
    }
  }

  #validateDateTime(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    const regex = new RegExp(
      '([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\\.[0-9]+)?(Z|(\\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?)?)?'
    );
    if (!typedValue.value.match(regex)) {
      this.#createIssue(elementDefinition, 'Invalid dateTime format');
      return;
    }
  }

  #validateDecimal(typedValue: TypedValue, elementDefinition: ElementDefinition): boolean {
    if (typeof typedValue.value !== 'number') {
      this.#createIssue(elementDefinition, 'Invalid type for decimal');
      return false;
    }
    if (isNaN(typedValue.value) || !isFinite(typedValue.value)) {
      this.#createIssue(elementDefinition, 'Invalid decimal value');
      return false;
    }
    return true;
  }

  #validateId(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    const regex = new RegExp('[A-Za-z0-9\\-\\.]{1,64}');
    if (!typedValue.value.match(regex)) {
      this.#createIssue(elementDefinition, 'Invalid id format');
      return;
    }
  }

  #validateInstant(typedValue: TypedValue, elementDefinition: ElementDefinition): void {
    if (!this.#validateString(typedValue, elementDefinition)) {
      return;
    }
    const regex = new RegExp(
      '([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\\.[0-9]+)?(Z|(\\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00))'
    );
    if (!typedValue.value.match(regex)) {
      this.#createIssue(elementDefinition, 'Invalid instant format');
      return;
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
    const regex = new RegExp('urn:oid:[0-2](\\.(0|[1-9][0-9]*))+');
    if (!typedValue.value.match(regex)) {
      this.#createIssue(elementDefinition, 'Invalid oid format');
      return;
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
    const regex = new RegExp('([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\\.[0-9]+)?');
    if (!typedValue.value.match(regex)) {
      this.#createIssue(elementDefinition, 'Invalid time format');
      return;
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
    const regex = new RegExp('urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
    if (!typedValue.value.match(regex)) {
      this.#createIssue(elementDefinition, 'Invalid uuid format');
      return;
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
