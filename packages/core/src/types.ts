import {
  Bundle,
  BundleEntry,
  CodeableConcept,
  ElementDefinition,
  Reference,
  Resource,
  ResourceType,
  SearchParameter,
  StructureDefinition,
} from '@medplum/fhirtypes';
import baseSchema from './base-schema.json';
import { SearchParameterDetails } from './search/details';
import { capitalize, createReference } from './utils';
import { formatHumanName } from './format';

export interface TypedValue {
  readonly type: string;
  readonly value: any;
}

/**
 * List of property types.
 * http://www.hl7.org/fhir/valueset-defined-types.html
 * The list here includes additions found from StructureDefinition resources.
 */
export enum PropertyType {
  Address = 'Address',
  Age = 'Age',
  Annotation = 'Annotation',
  Attachment = 'Attachment',
  BackboneElement = 'BackboneElement',
  CodeableConcept = 'CodeableConcept',
  Coding = 'Coding',
  ContactDetail = 'ContactDetail',
  ContactPoint = 'ContactPoint',
  Contributor = 'Contributor',
  Count = 'Count',
  DataRequirement = 'DataRequirement',
  Distance = 'Distance',
  Dosage = 'Dosage',
  Duration = 'Duration',
  Expression = 'Expression',
  Extension = 'Extension',
  HumanName = 'HumanName',
  Identifier = 'Identifier',
  MarketingStatus = 'MarketingStatus',
  Meta = 'Meta',
  Money = 'Money',
  Narrative = 'Narrative',
  ParameterDefinition = 'ParameterDefinition',
  Period = 'Period',
  Population = 'Population',
  ProdCharacteristic = 'ProdCharacteristic',
  ProductShelfLife = 'ProductShelfLife',
  Quantity = 'Quantity',
  Range = 'Range',
  Ratio = 'Ratio',
  Reference = 'Reference',
  RelatedArtifact = 'RelatedArtifact',
  SampledData = 'SampledData',
  Signature = 'Signature',
  SubstanceAmount = 'SubstanceAmount',
  SystemString = 'http://hl7.org/fhirpath/System.String',
  Timing = 'Timing',
  TriggerDefinition = 'TriggerDefinition',
  UsageContext = 'UsageContext',
  base64Binary = 'base64Binary',
  boolean = 'boolean',
  canonical = 'canonical',
  code = 'code',
  date = 'date',
  dateTime = 'dateTime',
  decimal = 'decimal',
  id = 'id',
  instant = 'instant',
  integer = 'integer',
  markdown = 'markdown',
  oid = 'oid',
  positiveInt = 'positiveInt',
  string = 'string',
  time = 'time',
  unsignedInt = 'unsignedInt',
  uri = 'uri',
  url = 'url',
  uuid = 'uuid',
}

/**
 * An IndexedStructureDefinition is a lookup-optimized version of a StructureDefinition.
 *
 * StructureDefinition resources contain schema information for other resource types.
 * These schemas can be used to automatically generate user interface elements for
 * resources.
 *
 * However, a StructureDefinition resource is not optimized for realtime lookups.  All
 * resource types, sub types, and property definitions are stored in a flat array of
 * ElementDefinition objects.  Therefore, to lookup the schema for a property (i.e., "Patient.name")
 * requires a linear scan of all ElementDefinition objects
 *
 * A StructureDefinition resource contains information about one or more types.
 * For example, the "Patient" StructureDefinition includes "Patient", "Patient_Contact",
 * "Patient_Communication", and "Patient_Link".  This is inefficient.
 *
 * Instead, we create an indexed version of the StructureDefinition, called IndexedStructureDefinition.
 * In an IndexedStructureDefinition, retrieving a property definition is a hashtable lookup.
 *
 * The hierarchy is:
 *   IndexedStructureDefinition - top level for one resource type
 *   TypeSchema - one per resource type and all contained BackboneElements
 *   PropertySchema - one per property/field
 */
export interface IndexedStructureDefinition {
  types: { [resourceType: string]: TypeSchema };
}

/**
 * An indexed TypeSchema.
 *
 * Example:  The IndexedStructureDefinition for "Patient" would include the following TypeSchemas:
 *   1) Patient
 *   2) Patient_Contact
 *   3) Patient_Communication
 *   4) Patient_Link
 */
export interface TypeSchema {
  structureDefinition: StructureDefinition;
  elementDefinition: ElementDefinition;
  display: string;
  properties: { [name: string]: ElementDefinition };
  searchParams?: { [code: string]: SearchParameter };
  searchParamsDetails?: { [code: string]: SearchParameterDetails };
  description?: string;
  parentType?: string;
}

/**
 * Indexes a bundle of StructureDefinitions for faster lookup.
 * @param bundle A FHIR bundle StructureDefinition resources.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
export function indexStructureDefinitionBundle(bundle: Bundle): void {
  for (const entry of bundle.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;
    if (resource.resourceType === 'StructureDefinition') {
      indexStructureDefinition(resource);
    }
  }
}

/**
 * Indexes a StructureDefinition for fast lookup.
 * @param structureDefinition The original StructureDefinition.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
export function indexStructureDefinition(structureDefinition: StructureDefinition): void {
  const typeName = structureDefinition.name;
  if (!typeName) {
    return;
  }

  const elements = structureDefinition.snapshot?.element;
  if (elements) {
    // @TODO(ThatOneBro 29 Aug 2023): any reason why this can't be done in one loop?
    // @TODO(ThatOneBro): Using numeric for loops would be better since they avoid overhead of iterators that you get with for...of
    for (const element of elements) {
      // First pass, build types
      indexType(structureDefinition, element);
    }

    for (const element of elements) {
      // Second pass, build properties
      indexProperty(structureDefinition, element);
    }
  }
}

/**
 * Indexes TypeSchema from an ElementDefinition.
 * In the common case, there will be many ElementDefinition instances per TypeSchema.
 * Only the first occurrence is saved.
 * @param structureDefinition The parent type structure definition.
 * @param elementDefinition The element definition.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
function indexType(structureDefinition: StructureDefinition, elementDefinition: ElementDefinition): void {
  const path = elementDefinition.path as string;
  const typeCode = elementDefinition.type?.[0]?.code;
  if (typeCode !== undefined && typeCode !== 'Element' && typeCode !== 'BackboneElement') {
    return;
  }

  const parts = path.split('.');

  // Force the first part to be the type name
  // This is necessary for "SimpleQuantity" and "MoneyQuantity"
  parts[0] = structureDefinition.name as string;

  const typeName = buildTypeName(parts);
  let typeSchema = globalSchema.types[typeName];

  if (!typeSchema) {
    globalSchema.types[typeName] = typeSchema = {} as TypeSchema;
  }

  typeSchema.parentType = typeSchema.parentType ?? buildTypeName(parts.slice(0, parts.length - 1));
  typeSchema.display = typeSchema.display ?? typeName;
  typeSchema.structureDefinition = typeSchema.structureDefinition ?? structureDefinition;
  typeSchema.elementDefinition = typeSchema.elementDefinition ?? elementDefinition;
  typeSchema.description = typeSchema.description ?? elementDefinition.definition;
  typeSchema.properties = typeSchema.properties ?? {};
}

/**
 * Indexes PropertySchema from an ElementDefinition.
 * @param structureDefinition The input StructureDefinition.
 * @param element The input ElementDefinition.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
function indexProperty(structureDefinition: StructureDefinition, element: ElementDefinition): void {
  const path = element.path as string;
  const parts = path.split('.');
  if (parts.length === 1) {
    return;
  }

  // Force the first part to be the type name
  // This is necessary for "SimpleQuantity" and "MoneyQuantity"
  parts[0] = structureDefinition.name as string;

  const typeName = buildTypeName(parts.slice(0, parts.length - 1));
  const typeSchema = globalSchema.types[typeName];
  if (!typeSchema) {
    return;
  }
  const key = parts[parts.length - 1];
  typeSchema.properties[key] = element;
}

/**
 * Indexes a bundle of SearchParameter resources for faster lookup.
 * @param bundle A FHIR bundle SearchParameter resources.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
export function indexSearchParameterBundle(bundle: Bundle<SearchParameter>): void {
  for (const entry of bundle.entry as BundleEntry[]) {
    const resource = entry.resource as SearchParameter;
    if (resource.resourceType === 'SearchParameter') {
      indexSearchParameter(resource);
    }
  }
}

/**
 * Indexes a SearchParameter resource for fast lookup.
 * Indexes by SearchParameter.code, which is the query string parameter name.
 * @param searchParam The SearchParameter resource.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
export function indexSearchParameter(searchParam: SearchParameter): void {
  for (const resourceType of searchParam.base ?? []) {
    const typeSchema = globalSchema.types[resourceType];
    if (!typeSchema) {
      continue;
    }

    if (!typeSchema.searchParams) {
      typeSchema.searchParams = {
        _id: {
          base: [resourceType],
          code: '_id',
          type: 'token',
          expression: resourceType + '.id',
        } as SearchParameter,
        _lastUpdated: {
          base: [resourceType],
          code: '_lastUpdated',
          type: 'date',
          expression: resourceType + '.meta.lastUpdated',
        } as SearchParameter,
        _compartment: {
          base: [resourceType],
          code: '_compartment',
          type: 'reference',
          expression: resourceType + '.meta.compartment',
        } as SearchParameter,
        _profile: {
          base: [resourceType],
          code: '_profile',
          type: 'uri',
          expression: resourceType + '.meta.profile',
        } as SearchParameter,
        _security: {
          base: [resourceType],
          code: '_security',
          type: 'token',
          expression: resourceType + '.meta.security',
        } as SearchParameter,
        _source: {
          base: [resourceType],
          code: '_source',
          type: 'uri',
          expression: resourceType + '.meta.source',
        } as SearchParameter,
        _tag: {
          base: [resourceType],
          code: '_tag',
          type: 'token',
          expression: resourceType + '.meta.tag',
        } as SearchParameter,
      };
    }

    typeSchema.searchParams[searchParam.code as string] = searchParam;
  }
}

/**
 * Returns the type name for an ElementDefinition.
 * @param elementDefinition The element definition.
 * @returns The Medplum type name.
 */
export function getElementDefinitionTypeName(elementDefinition: ElementDefinition): string {
  const code = elementDefinition.type?.[0]?.code as string;
  return code === 'BackboneElement' || code === 'Element'
    ? buildTypeName((elementDefinition.base?.path ?? elementDefinition.path)?.split('.') as string[])
    : code;
}

export function buildTypeName(components: string[]): string {
  if (components.length === 1) {
    return components[0];
  }
  return components.map(capitalize).join('');
}

/**
 * Returns true if the type schema is a non-abstract FHIR resource.
 * @param typeSchema The type schema to check.
 * @returns True if the type schema is a non-abstract FHIR resource.
 */
export function isResourceTypeSchema(typeSchema: TypeSchema): boolean {
  const structureDefinition = typeSchema.structureDefinition;
  return (
    structureDefinition &&
    structureDefinition.name === typeSchema.elementDefinition.path &&
    structureDefinition.kind === 'resource' &&
    !structureDefinition.abstract
  );
}

/**
 * Returns an array of all resource types.
 * Note that this is based on globalSchema, and will only return resource types that are currently in memory.
 * @returns An array of all resource types.
 */
export function getResourceTypes(): ResourceType[] {
  const result: ResourceType[] = [];
  for (const [resourceType, typeSchema] of Object.entries(globalSchema.types)) {
    if (isResourceTypeSchema(typeSchema)) {
      result.push(resourceType as ResourceType);
    }
  }
  return result;
}

/**
 * Returns the type schema for the resource type.
 * @param resourceType The resource type.
 * @returns The type schema for the resource type.
 */
export function getResourceTypeSchema(resourceType: string): TypeSchema {
  return globalSchema.types[resourceType];
}

/**
 * Returns the search parameters for the resource type indexed by search code.
 * @param resourceType The resource type.
 * @returns The search parameters for the resource type indexed by search code.
 */
export function getSearchParameters(resourceType: string): Record<string, SearchParameter> | undefined {
  return globalSchema.types[resourceType].searchParams;
}

/**
 * Returns a human friendly display name for a FHIR element definition path.
 * @param path The FHIR element definition path.
 * @returns The best guess of the display name.
 */
export function getPropertyDisplayName(path: string): string {
  // Get the property name, which is the remainder after the last period
  // For example, for path "Patient.birthDate"
  // the property name is "birthDate"
  const propertyName = path.replaceAll('[x]', '').split('.').pop() as string;

  // Split by capital letters
  // Capitalize the first letter of each word
  // Join together with spaces in between
  // Then normalize whitespace to single space character
  // For example, for property name "birthDate",
  // the display name is "Birth Date".
  return propertyName
    .split(/(?=[A-Z])/)
    .map(capitalizeDisplayWord)
    .join(' ')
    .replace('_', ' ')
    .replace(/\s+/g, ' ');
}

const capitalizedWords = new Set(['ID', 'IP', 'PKCE', 'JWKS', 'URI', 'URL']);

function capitalizeDisplayWord(word: string): string {
  const upper = word.toUpperCase();
  if (capitalizedWords.has(upper)) {
    return upper;
  }
  return upper.charAt(0) + word.slice(1);
}

/**
 * Returns an element definition by type and property name.
 * Handles content references.
 * @param typeName The type name.
 * @param propertyName The property name.
 * @returns The element definition if found.
 */
export function getElementDefinition(typeName: string, propertyName: string): ElementDefinition | undefined {
  const typeSchema = globalSchema.types[typeName];
  if (!typeSchema) {
    return undefined;
  }

  const property = typeSchema.properties[propertyName] ?? typeSchema.properties[propertyName + '[x]'];
  if (!property) {
    return undefined;
  }

  if (property.contentReference) {
    // Content references start with a "#"
    // Remove the "#" character
    const contentReference = property.contentReference.substring(1).split('.');
    const referencePropertyName = contentReference.pop() as string;
    const referenceTypeName = buildTypeName(contentReference);
    return getElementDefinition(referenceTypeName, referencePropertyName);
  }

  return property;
}

/**
 * Typeguard to validate that an object is a FHIR resource
 * @param value The object to check
 * @returns True if the input is of type 'object' and contains property 'resourceType'
 */
export function isResource(value: unknown): value is Resource {
  return !!(value && typeof value === 'object' && 'resourceType' in value);
}

/**
 * Typeguard to validate that an object is a FHIR resource
 * @param value The object to check
 * @returns True if the input is of type 'object' and contains property 'reference'
 */
export function isReference(value: unknown): value is Reference & { reference: string } {
  return !!(value && typeof value === 'object' && 'reference' in value);
}

/**
 * Global schema singleton.
 */
export const globalSchema = baseSchema as unknown as IndexedStructureDefinition;

/**
 * Output the string representation of a value, suitable for use as part of a search query.
 * @param v The value to format as a string
 * @returns The stringified value
 */
export function formatTypedValue(v: TypedValue): string {
  switch (v.type) {
    case PropertyType.uuid:
    case PropertyType.uri:
    case PropertyType.url:
    case PropertyType.string:
    case PropertyType.oid:
    case PropertyType.markdown:
    case PropertyType.id:
    case PropertyType.code:
    case PropertyType.canonical:
    case PropertyType.base64Binary:
    case PropertyType.SystemString:
    case PropertyType.date:
    case PropertyType.dateTime:
    case PropertyType.instant:
      // many types are represented as string primitives
      return v.value as string;
    case PropertyType.Identifier:
      return `${v.value.system}|${v.value.value}`;
    case PropertyType.Coding:
      return `${v.value.system}|${v.value.code}`;
    case PropertyType.CodeableConcept:
      return (v.value as CodeableConcept).coding?.map((c) => `${c.system}|${c.code}`).join(',') ?? v.value.text;
    case PropertyType.HumanName:
      if (v.value.text) {
        return v.value.text;
      }
      return formatHumanName(v.value);
    case PropertyType.unsignedInt:
    case PropertyType.positiveInt:
    case PropertyType.integer:
    case PropertyType.decimal:
      return (v.value as number).toString();
    case PropertyType.boolean:
      return v.value ? 'true' : 'false';
    case PropertyType.Extension:
      return v.value.url;
    case PropertyType.ContactPoint:
      return v.value.value;
    case PropertyType.Quantity:
    case PropertyType.Age:
    case PropertyType.Count:
    case PropertyType.Duration:
      return `${v.value.value}|${v.value.system}|${v.value.code || v.value.unit}`;
    case PropertyType.Reference:
      return v.value.reference;
    default:
      if (isResource(v.value)) {
        return createReference(v.value).reference as string;
      }
      return JSON.stringify(v);
  }
}
