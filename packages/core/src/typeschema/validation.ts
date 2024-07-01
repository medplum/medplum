import { OperationOutcomeIssue, Resource, StructureDefinition } from '@medplum/fhirtypes';
import { HTTP_HL7_ORG, UCUM } from '../constants';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { getTypedPropertyValue, toTypedValue } from '../fhirpath/utils';
import {
  OperationOutcomeError,
  createConstraintIssue,
  createOperationOutcomeIssue,
  createProcessingIssue,
  createStructureIssue,
  validationError,
} from '../outcomes';
import { PropertyType, TypedValue, isReference, isResource } from '../types';
import { arrayify, deepEquals, deepIncludes, isEmpty, isLowerCase } from '../utils';
import { ResourceVisitor, TypedValueWithPath, crawlResource, getNestedProperty } from './crawler';
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
  integer64: 'string',
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
export const validationRegexes: Record<string, RegExp> = {
  base64Binary: /^([A-Za-z\d+/]{4})*([A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/,
  canonical: /^\S*$/,
  code: /^[^\s]+( [^\s]+)*$/,
  date: /^(\d(\d(\d[1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2]\d|3[0-1]))?)?$/,
  dateTime:
    /^(\d(\d(\d[1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2]\d|3[0-1])(T([01]\d|2[0-3])(:[0-5]\d:([0-5]\d|60)(\.\d{1,9})?)?)?)?(Z|[+-]((0\d|1[0-3]):[0-5]\d|14:00)?)?)?$/,
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
const skippedConstraintKeys: Record<string, boolean> = {
  'ele-1': true,
  'dom-3': true, // If the resource is contained in another resource, it SHALL be referred to from elsewhere in the resource (requries "descendants()")
  'org-1': true, // The organization SHALL at least have a name or an identifier, and possibly more than one (back compat)
  'sdf-19': true, // FHIR Specification models only use FHIR defined types
};

export interface ValidatorOptions {
  profile?: StructureDefinition;
}

export function validateResource(resource: Resource, options?: ValidatorOptions): OperationOutcomeIssue[] {
  if (!resource.resourceType) {
    throw new OperationOutcomeError(validationError('Missing resource type'));
  }
  return new ResourceValidator(toTypedValue(resource), options).validate();
}

export function validateTypedValue(typedValue: TypedValue, options?: ValidatorOptions): OperationOutcomeIssue[] {
  return new ResourceValidator(typedValue, options).validate();
}

class ResourceValidator implements ResourceVisitor {
  private issues: OperationOutcomeIssue[];
  private root: TypedValue;
  private currentResource: Resource[];
  private readonly schema: InternalTypeSchema;

  constructor(typedValue: TypedValue, options?: ValidatorOptions) {
    this.issues = [];
    this.root = typedValue;
    this.currentResource = [];
    if (isResource(typedValue.value)) {
      this.currentResource.push(typedValue.value);
    }
    if (!options?.profile) {
      this.schema = getDataType(typedValue.type);
    } else {
      this.schema = parseStructureDefinition(options.profile);
    }
  }

  validate(): OperationOutcomeIssue[] {
    // Check root constraints
    this.constraintsCheck(this.root, this.schema, this.root.type);

    checkObjectForNull(this.root.value as unknown as Record<string, unknown>, this.root.type, this.issues);

    crawlResource(this.root.value as Resource, this, this.schema, this.root.type);

    const issues = this.issues;

    let foundError = false;
    for (const issue of issues) {
      if (issue.severity === 'error') {
        foundError = true;
      }
    }

    if (foundError) {
      throw new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        issue: issues,
      });
    }

    return issues;
  }

  onExitObject(path: string, obj: TypedValueWithPath, schema: InternalTypeSchema): void {
    //@TODO(mattwiller 2023-06-05): Detect extraneous properties in a single pass by keeping track of all keys that
    // were correctly matched to resource properties as elements are validated above
    this.checkAdditionalProperties(obj, schema.elements, path);
  }

  onEnterResource(_path: string, obj: TypedValueWithPath): void {
    this.currentResource.push(obj.value);
  }

  onExitResource(): void {
    this.currentResource.pop();
  }

  visitProperty(
    _parent: TypedValueWithPath,
    key: string,
    path: string,
    propertyValues: (TypedValueWithPath | TypedValueWithPath[])[],
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
      let values: TypedValueWithPath[];
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
            element.path,
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
        this.referenceTypeCheck(value, element, path);
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
    value: TypedValueWithPath | TypedValueWithPath[],
    field: InternalSchemaElement,
    path: string
  ): boolean {
    if (!Array.isArray(value) && value.value === undefined) {
      if (field.min > 0) {
        this.issues.push(createStructureIssue(value.path, 'Missing required property'));
      }
      return false;
    }

    if (isEmpty(value)) {
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
    const choiceOfTypeElements: Record<string, string> = {};
    for (const key of Object.keys(object)) {
      if (key === 'resourceType') {
        continue; // Skip special resource type discriminator property in JSON
      }
      const choiceOfTypeElementName = isChoiceOfType(parent, key, properties);
      if (choiceOfTypeElementName) {
        // check that the type of the primitive extension matches the type of the property
        let relatedElementName: string;
        let requiredRelatedElementName: string;
        if (choiceOfTypeElementName.startsWith('_')) {
          relatedElementName = choiceOfTypeElementName.slice(1);
          requiredRelatedElementName = key.slice(1);
        } else {
          relatedElementName = '_' + choiceOfTypeElementName;
          requiredRelatedElementName = '_' + key;
        }

        if (
          relatedElementName in choiceOfTypeElements &&
          choiceOfTypeElements[relatedElementName] !== requiredRelatedElementName
        ) {
          this.issues.push(
            createOperationOutcomeIssue(
              'warning',
              'structure',
              `Type of primitive extension does not match the type of property "${choiceOfTypeElementName.startsWith('_') ? choiceOfTypeElementName.slice(1) : choiceOfTypeElementName}"`,
              choiceOfTypeElementName
            )
          );
        }

        if (choiceOfTypeElements[choiceOfTypeElementName]) {
          // Found a duplicate choice of type property
          // TODO: This should be an error, but it's currently a warning to avoid breaking existing code
          // Warnings are logged, but do not cause validation to fail
          this.issues.push(
            createOperationOutcomeIssue(
              'warning',
              'structure',
              `Duplicate choice of type property "${choiceOfTypeElementName}"`,
              choiceOfTypeElementName
            )
          );
        }
        choiceOfTypeElements[choiceOfTypeElementName] = key;
        continue;
      }
      if (!(key in properties) && !(key.startsWith('_') && key.slice(1) in properties)) {
        this.issues.push(createStructureIssue(`${path}.${key}`, `Invalid additional property "${key}"`));
      }
    }
  }

  private constraintsCheck(value: TypedValue, field: InternalTypeSchema | InternalSchemaElement, path: string): void {
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

  private referenceTypeCheck(value: TypedValue, field: InternalSchemaElement, path: string): void {
    if (value.type !== 'Reference') {
      return;
    }

    const reference = value.value;
    if (!isReference(reference)) {
      // Silently ignore unrecognized reference types
      return;
    }

    const referenceResourceType = reference.reference.split('/')[0];
    if (!referenceResourceType) {
      // Silently ignore empty references - that will get picked up by constraint validation
      return;
    }

    const targetProfiles = field.type.find((t) => t.code === 'Reference')?.targetProfile;
    if (!targetProfiles) {
      // No required target profiles
      return;
    }

    const hl7BaseUrl = HTTP_HL7_ORG + '/fhir/StructureDefinition/';
    const hl7AllResourcesUrl = hl7BaseUrl + 'Resource';
    const hl7ResourceTypeUrl = hl7BaseUrl + referenceResourceType;

    const medplumBaseUrl = 'https://medplum.com/fhir/StructureDefinition/';
    const medplumResourceTypeUrl = medplumBaseUrl + referenceResourceType;

    for (const targetProfile of targetProfiles) {
      if (
        targetProfile === hl7AllResourcesUrl ||
        targetProfile === hl7ResourceTypeUrl ||
        targetProfile === medplumResourceTypeUrl
      ) {
        // Found a matching profile
        return;
      }

      if (!targetProfile.startsWith(hl7BaseUrl) && !targetProfile.startsWith(medplumBaseUrl)) {
        // This is an unrecognized target profile string
        // For example, it could be US-Core or a custom profile definition
        // Example: http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient
        // And therefore we cannot validate
        return;
      }
    }

    // All of the target profiles were recognized formats
    // and we did not find a match
    // TODO: This should be an error, but it's currently a warning to avoid breaking existing code
    // Warnings are logged, but do not cause validation to fail
    this.issues.push(
      createOperationOutcomeIssue(
        'warning',
        'structure',
        `Invalid reference for "${path}", got "${referenceResourceType}", expected "${targetProfiles.join('", "')}"`,
        path
      )
    );
  }

  private isExpressionTrue(constraint: Constraint, value: TypedValue, path: string): boolean {
    const variables: Record<string, TypedValue> = {
      '%context': value,
      '%ucum': toTypedValue(UCUM),
    };

    if (this.currentResource.length > 0) {
      variables['%resource'] = toTypedValue(this.currentResource[this.currentResource.length - 1]);
    }

    if (isResource(this.root.value)) {
      variables['%rootResource'] = this.root;
    }

    try {
      const evalValues = evalFhirPathTyped(constraint.expression, [value], variables);

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
      // biome-ignore lint/suspicious/useValidTypeof: expected value ensured to be one of: 'string' | 'boolean' | 'number'
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
    if (Number.isNaN(n) || !Number.isFinite(n)) {
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

/**
 * Returns the choice-of-type element name if the key is a choice of type property.
 * Returns undefined if the key is not a choice of type property.
 * @param typedValue - The value to check.
 * @param key - The object key to check. This is different than the element name, which could contain "[x]".
 * @param propertyDefinitions - The property definitions for the object..
 * @returns The element name if a choice of type property is present, otherwise undefined.
 */
function isChoiceOfType(
  typedValue: TypedValue,
  key: string,
  propertyDefinitions: Record<string, InternalSchemaElement>
): string | undefined {
  let prefix = '';
  if (key.startsWith('_')) {
    key = key.slice(1);
    prefix = '_';
  }
  const parts = key.split(/(?=[A-Z])/g); // Split before capital letters
  let testProperty = '';
  for (const part of parts) {
    testProperty += part;
    const elementName = testProperty + '[x]';
    if (propertyDefinitions[elementName]) {
      const typedPropertyValue = getTypedPropertyValue(typedValue, testProperty);
      return typedPropertyValue ? prefix + elementName : undefined;
    }
  }
  return undefined;
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
  // It is possible that `value` has additional keys beyond `type` and `value` (e.g. `expression` if a
  // `TypedValueWithExpression` is being used), so ensure that only `type` and `value` are considered for comparison.
  const typeAndValue = Array.isArray(value)
    ? value.map((v) => ({ type: v.type, value: v.value }))
    : { type: value.type, value: value.value };

  if (element.pattern && !deepIncludes(typeAndValue, element.pattern)) {
    return false;
  }
  if (element.fixed && !deepEquals(typeAndValue, element.fixed)) {
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

  let sliceElement: InternalSchemaElement | undefined;
  if (discriminator.path === '$this') {
    sliceElement = slice;
  } else {
    sliceElement = (elements ?? slice.elements)[discriminator.path];
  }

  const sliceType = slice.type;
  switch (discriminator.type) {
    case 'value':
    case 'pattern':
      if (!value || !sliceElement) {
        return false;
      }
      if (sliceElement.pattern) {
        return deepIncludes(value, sliceElement.pattern);
      }
      if (sliceElement.fixed) {
        return deepEquals(value, sliceElement.fixed);
      }

      if (sliceElement.binding?.strength === 'required' && sliceElement.binding.valueSet) {
        // This cannot be implemented correctly without asynchronous validation, so make it permissive for now.
        // Ideally this should check something like value.value.coding.some((code) => isValidCode(sliceElement.binding.valueSet, code))
        // where isValidCode is a function that checks if the code is included in the expansion of the ValueSet
        return true;
      }
      break;
    case 'type':
      if (!value || !sliceType?.length) {
        return false;
      }
      return sliceType.some((t) => t.code === value.type);
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
      slicingRules.discriminator.every((discriminator) =>
        arrayify(getNestedProperty(value, discriminator.path))?.some((v) => matchDiscriminant(v, discriminator, slice))
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
