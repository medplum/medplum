import { OperationOutcomeIssue, Resource, StructureDefinition } from '@medplum/fhirtypes';
import { UCUM } from '../constants';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { getTypedPropertyValue, toTypedValue } from '../fhirpath/utils';
import {
  OperationOutcomeError,
  createConstraintIssue,
  createProcessingIssue,
  createStructureIssue,
  validationError,
} from '../outcomes';
import { PropertyType, TypedValue } from '../types';
import { arrayify, deepEquals, deepIncludes, isEmpty, isLowerCase } from '../utils';
import { ResourceVisitor, crawlResource, getNestedProperty } from './crawler';
import {
  Constraint,
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDefinition,
  SliceDiscriminator,
  SlicingRules,
  getDataType,
  parseStructureDefinition,
} from './types';

/*
 * This file provides schema validation utilities for FHIR JSON objects.
 *
 * See: [JSON Representation of Resources](https://hl7.org/fhir/json.html)
 * See: [FHIR Data Types](https://www.hl7.org/fhir/datatypes.html)
 */
export const fhirTypeToJsType = {
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
} as const satisfies Record<string, 'string' | 'boolean' | 'number'>;

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
} as const;

/**
 * List of constraint keys that aren't to be checked in an expression.
 */
const skippedConstraintKeys: Record<string, boolean> = { 'ele-1': true };

export function validateResource(resource: Resource, profile?: StructureDefinition): void {
  new ResourceValidator(resource.resourceType, resource, profile).validate();
}

class ResourceValidator implements ResourceVisitor {
  private issues: OperationOutcomeIssue[];
  private rootResource: Resource;
  private currentResource: Resource[];
  private readonly schema: InternalTypeSchema;

  constructor(resourceType: string, rootResource: Resource, profile?: StructureDefinition) {
    this.issues = [];
    this.rootResource = rootResource;
    this.currentResource = [];
    if (!profile) {
      this.schema = getDataType(resourceType);
    } else {
      this.schema = parseStructureDefinition(profile);
    }
  }

  validate(): void {
    const resourceType = this.rootResource.resourceType;
    if (!resourceType) {
      throw new OperationOutcomeError(validationError('Missing resource type'));
    }

    checkObjectForNull(this.rootResource as unknown as Record<string, unknown>, resourceType, this.issues);

    crawlResource(this.rootResource, this, this.schema);

    const issues = this.issues;
    this.issues = []; // Reset issues to allow re-using the validator for other resources
    if (issues.length > 0) {
      throw new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        issue: issues,
      });
    }
  }

  onExitObject(path: string, obj: TypedValue, schema: InternalTypeSchema): void {
    //@TODO(mattwiller 2023-06-05): Detect extraneous properties in a single pass by keeping track of all keys that
    // were correctly matched to resource properties as elements are validated above
    this.checkAdditionalProperties(obj, schema.elements, path);
  }

  onEnterResource(_path: string, obj: TypedValue): void {
    this.currentResource.push(obj.value);
  }

  onExitResource(): void {
    this.currentResource.pop();
  }

  visitProperty(
    _parent: TypedValue,
    key: string,
    path: string,
    propertyValues: (TypedValue | TypedValue[] | undefined)[],
    schema: InternalTypeSchema
  ): void {
    const element = schema.elements[key];
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
      const sliceCounts: Record<string, number> | undefined = element.slicing
        ? Object.fromEntries(element.slicing.slices.map((s) => [s.name, 0]))
        : undefined;
      for (const value of values) {
        this.constraintsCheck(value, element, path);
        this.checkPropertyValue(value, path);
        const sliceName = checkSliceElement(value, element.slicing);
        if (sliceName && sliceCounts) {
          sliceCounts[sliceName] += 1;
        }
      }
      this.validateSlices(element.slicing?.slices, sliceCounts, path);
    }
  }

  private checkPresence(
    value: TypedValue | TypedValue[] | undefined,
    field: InternalSchemaElement,
    path: string
  ): value is TypedValue | TypedValue[] {
    if (value === undefined) {
      if (field.min > 0) {
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
    }
  }

  private validateSlices(
    slices: SliceDefinition[] | undefined,
    counts: Record<string, number> | undefined,
    path: string
  ): void {
    if (!slices || !counts) {
      return;
    }
    for (const slice of slices) {
      const sliceCardinality = counts[slice.name];
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

  private checkAdditionalProperties(
    parent: TypedValue,
    properties: Record<string, InternalSchemaElement>,
    path: string
  ): void {
    const object = parent.value as Record<string, unknown> | undefined;
    if (!object) {
      return;
    }
    for (const key of Object.keys(object)) {
      if (key === 'resourceType') {
        continue; // Skip special resource type discriminator property in JSON
      }
      if (
        !(key in properties) &&
        !(key.startsWith('_') && key.slice(1) in properties) &&
        !isChoiceOfType(parent, key, properties)
      ) {
        this.issues.push(createStructureIssue(`${path}.${key}`, `Invalid additional property "${key}"`));
      }
    }
  }

  private constraintsCheck(value: TypedValue, field: InternalSchemaElement, path: string): void {
    const constraints = field.constraints;
    if (!constraints) {
      return;
    }
    for (const constraint of constraints) {
      if (constraint.severity === 'error' && !(constraint.key in skippedConstraintKeys)) {
        const expression = this.isExpressionTrue(constraint, value, path);
        if (!expression) {
          this.issues.push(createConstraintIssue(path, constraint));
          return;
        }
      }
    }
  }

  private isExpressionTrue(constraint: Constraint, value: TypedValue, path: string): boolean {
    try {
      const evalValues = evalFhirPathTyped(constraint.expression, [value], {
        '%context': value,
        '%resource': toTypedValue(this.currentResource[this.currentResource.length - 1]),
        '%rootResource': toTypedValue(this.rootResource),
        '%ucum': toTypedValue(UCUM),
      });

      return evalValues.length === 1 && evalValues[0].value === true;
    } catch (e: any) {
      this.issues.push(
        createProcessingIssue(path, 'Error evaluating invariant expression', e, { fhirpath: constraint.expression })
      );
      return false;
    }
  }

  private validatePrimitiveType(typedValue: TypedValue, path: string): void {
    const [primitiveValue, extensionElement] = unpackPrimitiveElement(typedValue);
    if (primitiveValue) {
      const { type, value } = primitiveValue;
      // First, make sure the value is the correct JS type
      if (!(type in fhirTypeToJsType)) {
        this.issues.push(createStructureIssue(path, `Invalid JSON type: ${type} is not a valid FHIR type`));
        return;
      }
      const expectedType = fhirTypeToJsType[type as keyof typeof fhirTypeToJsType];
      // rome-ignore lint/suspicious/useValidTypeof: expected value ensured to be one of: 'string' | 'boolean' | 'number'
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
        this.validateString(value as string, type, path);
      } else if (expectedType === 'number') {
        this.validateNumber(value as number, type, path);
      }
    }
    if (extensionElement) {
      crawlResource(extensionElement.value, this, getDataType('Element'), path);
    }
  }

  private validateString(str: string, type: string, path: string): void {
    if (!str.trim()) {
      this.issues.push(createStructureIssue(path, 'String must contain non-whitespace content'));
      return;
    }

    const regex = validationRegexes[type];
    if (regex && !regex.exec(str)) {
      this.issues.push(createStructureIssue(path, 'Invalid ' + type + ' format'));
    }
  }

  private validateNumber(n: number, type: string, path: string): void {
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

function isIntegerType(propertyType: string): boolean {
  return (
    propertyType === PropertyType.integer ||
    propertyType === PropertyType.positiveInt ||
    propertyType === PropertyType.unsignedInt
  );
}

function isChoiceOfType(
  typedValue: TypedValue,
  key: string,
  propertyDefinitions: Record<string, InternalSchemaElement>
): boolean {
  if (key.startsWith('_')) {
    key = key.slice(1);
  }
  const parts = key.split(/(?=[A-Z])/g); // Split before capital letters
  let testProperty = '';
  for (const part of parts) {
    testProperty += part;
    if (propertyDefinitions[testProperty + '[x]']) {
      const typedPropertyValue = getTypedPropertyValue(typedValue, testProperty);
      return !!typedPropertyValue;
    }
  }
  return false;
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

function matchesSpecifiedValue(value: TypedValue | TypedValue[], element: InternalSchemaElement): boolean {
  if (element.pattern && !deepIncludes(value, element.pattern)) {
    return false;
  } else if (element.fixed && !deepEquals(value, element.fixed)) {
    return false;
  }
  return true;
}

export function matchDiscriminant(
  value: TypedValue | TypedValue[] | undefined,
  discriminator: SliceDiscriminator,
  slice: SliceDefinition,
  elements?: Record<string, InternalSchemaElement>
): boolean {
  if (Array.isArray(value)) {
    // Only single values can match
    return false;
  }

  const sliceElement: InternalSchemaElement = (elements ?? slice.elements)[discriminator.path];

  const sliceType = slice.type;
  switch (discriminator.type) {
    case 'value':
    case 'pattern':
      if (!value || !sliceElement) {
        return false;
      } else if (matchesSpecifiedValue(value, sliceElement)) {
        return true;
      }
      break;
    case 'type':
      if (!value || !sliceType?.length) {
        return false;
      } else {
        return sliceType.some((t) => t.code === value.type);
      }
    // Other discriminator types are not yet supported, see http://hl7.org/fhir/R4/profiling.html#discriminator
  }
  // Default to no match
  return false;
}

function checkSliceElement(value: TypedValue, slicingRules: SlicingRules | undefined): string | undefined {
  if (!slicingRules) {
    return undefined;
  }
  for (const slice of slicingRules.slices) {
    if (
      slicingRules.discriminator.every(
        (discriminator) =>
          arrayify(getNestedProperty(value, discriminator.path))?.some((v) =>
            matchDiscriminant(v, discriminator, slice)
          )
      )
    ) {
      return slice.name;
    }
  }
  return undefined;
}

function unpackPrimitiveElement(v: TypedValue): [TypedValue | undefined, TypedValue | undefined] {
  if (typeof v.value !== 'object' || !v.value) {
    return [v, undefined];
  }
  const primitiveValue = v.value.valueOf();
  if (primitiveValue === v.value) {
    return [undefined, { type: 'Element', value: v.value }];
  }
  const primitiveKeys = new Set(Object.keys(primitiveValue));
  const extensionEntries = Object.entries(v.value).filter(([k, _]) => !primitiveKeys.has(k));
  const extensionElement = extensionEntries.length > 0 ? Object.fromEntries(extensionEntries) : undefined;
  return [
    { type: v.type, value: primitiveValue },
    { type: 'Element', value: extensionElement },
  ];
}
