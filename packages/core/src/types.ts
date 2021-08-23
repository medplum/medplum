import { ElementDefinition, SearchParameter, StructureDefinition } from './fhir';

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
  ElementDefinition = 'ElementDefinition',
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
  Resource = 'Resource',
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
  display: string;
  properties: { [name: string]: ElementDefinition };
  searchParams?: SearchParameter[];
  description?: string;
  backboneElement?: boolean;
}

/**
 * Indexes a StructureDefinition for fast lookup.
 * See comments on IndexedStructureDefinition for more details.
 * @param structureDefinition The original StructureDefinition.
 * @return An indexed IndexedStructureDefinition.
 */
export function indexStructureDefinition(structureDefinition: StructureDefinition): IndexedStructureDefinition {
  const typeName = structureDefinition.name;
  if (!typeName || typeName === 'Resource') {
    throw new Error('Invalid StructureDefinition');
  }

  const output = {
    types: {}
  } as IndexedStructureDefinition;

  const elements = structureDefinition.snapshot?.element;
  if (elements) {
    // Filter out any elements missing path or type
    const filtered = elements.filter(e => e.path !== typeName && e.path && e.type && e.type.length > 0);

    // First pass, build types
    filtered.forEach(element => indexType(output, element));

    // Second pass, build properties
    filtered.forEach(element => indexProperty(output, element));
  }

  return output;
}

/**
 * Indexes TypeSchema from an ElementDefinition.
 * In the common case, there will be many ElementDefinition instances per TypeSchema.
 * Only the first occurrence is saved.
 * @param output The work-in-progress IndexedStructureDefinition.
 * @param element The input ElementDefinition.
 */
function indexType(output: IndexedStructureDefinition, element: ElementDefinition): void {
  const path = element.path as string;
  const parts = path.split('.');
  const typeName = buildTypeName(parts.slice(0, parts.length - 1));
  if (!(typeName in output.types)) {
    output.types[typeName] = {
      display: typeName,
      properties: {}
    };
  }
}

/**
 * Indexes PropertySchema from an ElementDefinition.
 * @param output The work-in-progress IndexedStructureDefinition.
 * @param element The input ElementDefinition.
 */
function indexProperty(output: IndexedStructureDefinition, element: ElementDefinition): void {
  const path = element.path as string;
  const parts = path.split('.');
  const typeName = buildTypeName(parts.slice(0, parts.length - 1));
  const typeSchema = output.types[typeName];
  const key = parts[parts.length - 1];
  typeSchema.properties[key] = element;
}

export function buildTypeName(components: string[]): string {
  return components.map(capitalize).join('_');
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.substr(1);
}

export function getPropertyDisplayName(property: ElementDefinition): string {
  // Get the property name, which is the remainder after the last period
  // For example, for path "Patient.birthDate"
  // the property name is "birthDate"
  const propertyName = (property.path as string).split('.').pop() as string;

  // Split by capital letters
  // Capitalize the first letter of each word
  // Join together with spaces in between
  // Then normalize whitespace to single space character
  // For example, for property name "birthDate",
  // the display name is "Birth Date".
  return propertyName
    .split(/(?=[A-Z])/)
    .map(capitalize)
    .join(' ')
    .replace('_', ' ')
    .replace(/\s+/g, ' ');
}
