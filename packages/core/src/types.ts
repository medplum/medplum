import { ElementDefinition, ElementDefinitionType, StructureDefinition } from './fhir';

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
  properties: { [name: string]: PropertySchema };
  description?: string;
  backboneElement?: boolean;
}

/**
 * An indexed PropertySchema.
 *
 * Within a StructureDefinition, the original ElementDefinition contains a comprehensive
 * representation of the property.  However, again, it is not optimized for realtime look-up.
 *
 * For example, the "type" is nested in objects and arrays.  There is no "name", which we
 * can implicitly derive from camelCase conversion.
 *
 * The PropertySchema object precomputes all of those for fast lookup at display time.
 */
export interface PropertySchema {
  key: string;
  display: string;
  type: string;
  description?: string;
  array?: boolean;
  enumValues?: string[];
  targetProfile?: string[];
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
  const typeSchema = output.types[typeName] as TypeSchema;
  const key = parts[parts.length - 1];
  const elementTypes = element.type as ElementDefinitionType[];

  const propertySchema = {
    key,
    display: buildDisplayName(key),
    description: element.definition,
    type: elementTypes[0].code as string
  } as PropertySchema;

  if (propertySchema.type === 'code') {
    propertySchema.type = 'enum';
    propertySchema.enumValues = element.short?.split(' | ');
  }

  if (propertySchema.type === 'BackboneElement') {
    propertySchema.type = buildTypeName((element.id as string).split('.'));
  }

  if (propertySchema.type === 'Reference'
    && elementTypes[0].targetProfile
    && elementTypes[0].targetProfile.length > 0) {
    propertySchema.targetProfile = (elementTypes[0].targetProfile as string[]).map(str => str.split('/').pop()) as string[];
  }

  if (element.max === '*') {
    propertySchema.array = true;
  }

  typeSchema.properties[key] = propertySchema;
}

function buildTypeName(components: string[]) {
  return components.map(capitalize).join('_');
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.substr(1);
}

function buildDisplayName(propertyName: string) {
  // Split by capital letters
  // Capitalize the first letter of each word
  // Join together with spaces in between
  // Then normalize whitespace to single space character
  return propertyName
    .split(/(?=[A-Z])/)
    .map(capitalize)
    .join(' ')
    .replace('_', ' ')
    .replace(/\s+/g, ' ');
}
