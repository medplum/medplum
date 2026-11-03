// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ElementDefinitionType, StructureDefinition } from '@medplum/fhirtypes';
import { FileBuilder, wordWrap } from '../filebuilder';
import { buildTypeName, isResourceTypeSchema } from '../types';
import { capitalize, EMPTY, escapeHtml, isLowerCase } from '../utils';
import type { InternalSchemaElement, InternalTypeSchema } from './types';
import { indexStructureDefinitionBundle, isResourceType, tryGetProfile } from './types';

export interface TypeScriptGeneratorOptions {
  /**
   * Returns the codes in a ValueSet, used to narrow bound string properties to a union of string literals.
   * If not provided, or if no codes are returned, bound properties are typed as `string`.
   */
  getValueSetValues?: (url: string) => string[] | undefined;
  /**
   * Returns the module specifier used to import a referenced type.
   * Defaults to a sibling file, e.g. `./Patient.d.ts`.
   */
  getImportPath?: (typeName: string) => string;
}

interface GeneratorContext extends TypeScriptGeneratorOptions {
  /** Set when generating a profile. Maps inner type names (e.g. "PatientContact") to profile-specific names. */
  profileInnerTypeNames?: Map<string, string>;
}

/**
 * Generates TypeScript definitions for FHIR StructureDefinitions, such as profiles.
 *
 * Returns one `.d.ts` file per StructureDefinition, plus an `index.d.ts` that exports them all.
 * Types that are not generated, such as base FHIR data types, are imported from `@medplum/fhirtypes` by default.
 *
 * The StructureDefinitions must include a `snapshot`, and are indexed as a side effect.
 * @param structureDefinitions - The StructureDefinitions to generate types for.
 * @param options - Optional generator options.
 * @returns A map of file names to TypeScript file contents.
 */
export function generateTypeScriptDefinitions(
  structureDefinitions: StructureDefinition[],
  options: TypeScriptGeneratorOptions = {}
): Record<string, string> {
  indexStructureDefinitionBundle(structureDefinitions);

  const schemas = structureDefinitions
    .map((sd) => tryGetProfile(sd.url) as InternalTypeSchema)
    .filter((s) => isResourceTypeSchema(s) || s.kind === 'complex-type' || s.kind === 'logical');
  const generatedNames = new Set(schemas.map((s) => s.name));
  const getImportPath =
    options.getImportPath ??
    ((typeName: string) => (generatedNames.has(typeName) ? './' + typeName + '.d.ts' : '@medplum/fhirtypes'));

  const files: Record<string, string> = {};
  const exported: string[] = [];
  for (const schema of schemas) {
    const contents = generateTypeScriptDefinition(schema, { ...options, getImportPath });
    if (contents) {
      files[schema.name + '.d.ts'] = contents;
      exported.push(schema.name);
    }
  }
  exported.sort((a, b) => a.localeCompare(b));
  files['index.d.ts'] = exported.map((name) => `export type { ${name} } from './${name}.d.ts';`).join('\n') + '\n';
  return files;
}

/**
 * Generates the contents of a TypeScript definition (`.d.ts`) file for a FHIR type schema,
 * including its inner (backbone element) types.
 *
 * The schema can be a base FHIR type or a profile, as returned by `parseStructureDefinition` or `tryGetProfile`.
 * @param fhirType - The type schema to generate an interface for.
 * @param options - Optional generator options.
 * @returns The TypeScript file contents, or undefined if the type has no elements.
 */
export function generateTypeScriptDefinition(
  fhirType: InternalTypeSchema,
  options: TypeScriptGeneratorOptions = {}
): string | undefined {
  if (Object.values(fhirType.elements).length === 0) {
    return undefined;
  }

  const context: GeneratorContext = { ...options };
  // A profile constrains a base type (e.g. USCorePatientProfile on Patient). Other StructureDefinitions define their
  // own type, which is either the same as the name (e.g. Patient) or a URL (e.g. logical models).
  if (fhirType.name !== fhirType.type && !fhirType.type.includes('/')) {
    context.profileInnerTypeNames = new Map(
      fhirType.innerTypes.map((t) => [t.name, fhirType.name + t.name.replace(fhirType.type, '')])
    );
  }

  const includedTypes = new Set<string>();
  const referencedTypes = new Set<string>();
  buildImports(fhirType, includedTypes, referencedTypes, context);

  const getImportPath = options.getImportPath ?? ((typeName: string) => './' + typeName + '.d.ts');
  const importsByPath = new Map<string, string[]>();
  for (const referencedType of Array.from(referencedTypes).sort((a, b) => a.localeCompare(b))) {
    if (!includedTypes.has(referencedType)) {
      const importPath = getImportPath(referencedType);
      importsByPath.set(importPath, [...(importsByPath.get(importPath) ?? []), referencedType]);
    }
  }

  const b = new FileBuilder();
  for (const [importPath, typeNames] of importsByPath) {
    b.append('import type { ' + typeNames.join(', ') + " } from '" + importPath + "';");
  }

  writeInterface(b, fhirType, context);
  return b.toString();
}

function writeInterface(b: FileBuilder, fhirType: InternalTypeSchema, options: GeneratorContext): void {
  if (Object.values(fhirType.elements).length === 0) {
    return;
  }

  const typeName = getTypeName(fhirType, options);
  const genericTypes = ['Bundle', 'BundleEntry', 'Reference'];
  const genericModifier = genericTypes.includes(typeName) ? '<T extends Resource = Resource>' : '';

  b.newLine();
  generateJavadoc(b, fhirType.description);
  b.append('export interface ' + typeName + genericModifier + ' {');
  b.indentCount++;

  if (fhirType.kind === 'resource') {
    b.newLine();
    generateJavadoc(b, `This is a ${typeName} resource`);
    b.append(`readonly resourceType: '${fhirType.type}';`);
  }

  for (const [path, property] of getDirectElements(fhirType)) {
    if (property.max === 0) {
      continue;
    }
    b.newLine();
    writeInterfaceProperty(b, fhirType, property, path, options);
  }

  if (typeName === 'Reference') {
    b.newLine();
    generateJavadoc(b, 'Optional Resource referred to by this reference.');
    b.append('resource?: T;');
  }

  b.indentCount--;
  b.append('}');

  writeChoiceOfTypeDefinitions(b, fhirType, options);

  const subTypes = fhirType.innerTypes;
  subTypes?.sort((t1, t2) => t1.name.localeCompare(t2.name));

  for (const subType of subTypes ?? EMPTY) {
    writeInterface(b, subType, options);
  }
}

function writeInterfaceProperty(
  b: FileBuilder,
  fhirType: InternalTypeSchema,
  property: InternalSchemaElement,
  path: string,
  options: GeneratorContext
): void {
  for (const typeScriptProperty of getTypeScriptProperties(property, path, fhirType, options)) {
    b.newLine();
    generateJavadoc(b, property.description);
    b.append(
      typeScriptProperty.name + (typeScriptProperty.required ? '' : '?') + ': ' + typeScriptProperty.typeName + ';'
    );
  }
}

function writeChoiceOfTypeDefinitions(b: FileBuilder, fhirType: InternalTypeSchema, options: GeneratorContext): void {
  for (const [path, property] of getDirectElements(fhirType)) {
    if (property.type.length > 1) {
      b.newLine();
      generateJavadoc(b, property.description);
      const unionName = getTypeName(fhirType, options) + capitalize(path.replaceAll('[x]', ''));
      const typesArray = getTypeScriptProperties(property, path, fhirType, options);
      const typesSet = new Set(typesArray.map((t) => t.typeName));
      const sortedTypesArray = Array.from(typesSet);
      sortedTypesArray.sort((a, b) => a.localeCompare(b));
      b.append(`export type ${unionName} = ${sortedTypesArray.join(' | ')};`);
    }
  }
}

function buildImports(
  fhirType: InternalTypeSchema,
  includedTypes: Set<string>,
  referencedTypes: Set<string>,
  options: GeneratorContext
): void {
  const typeName = getTypeName(fhirType, options);
  includedTypes.add(typeName);

  for (const [path, property] of getDirectElements(fhirType)) {
    for (const typeScriptProperty of getTypeScriptProperties(property, path, fhirType, options)) {
      cleanReferencedType(typeScriptProperty.typeName).forEach((cleanName) => referencedTypes.add(cleanName));
    }
  }

  const subTypes = fhirType.innerTypes;
  for (const subType of subTypes ?? EMPTY) {
    buildImports(subType, includedTypes, referencedTypes, options);
  }

  if (typeName === 'Reference') {
    referencedTypes.add('Resource');
  }
}

function getTypeName(fhirType: InternalTypeSchema, options: GeneratorContext): string {
  return options.profileInnerTypeNames?.get(fhirType.name) ?? fhirType.name;
}

// Profiles can also constrain elements of complex data types (e.g. "identifier.system"), which are not generated
function getDirectElements(fhirType: InternalTypeSchema): [string, InternalSchemaElement][] {
  return Object.entries(fhirType.elements).filter(([path]) => !path.includes('.'));
}

function cleanReferencedType(typeName: string): string[] {
  if (typeName === 'T') {
    return ['Resource'];
  }

  if (typeName.startsWith('NonNullable<')) {
    return [typeName.substring('NonNullable<'.length, typeName.indexOf('['))];
  }

  if (
    typeName.startsWith("'") ||
    typeName.includes("' | '") ||
    isLowerCase(typeName.charAt(0)) ||
    typeName === 'BundleEntry<T>[]'
  ) {
    return [];
  }

  if (typeName.startsWith('Reference<')) {
    const start = typeName.indexOf('<') + 1;
    const end = typeName.indexOf('>');
    return ['Reference', ...typeName.substring(start, end).split(' | ')];
  }

  return [typeName.replace('[]', '')];
}

function getTypeScriptProperties(
  property: InternalSchemaElement,
  path: string,
  fhirType: InternalTypeSchema,
  options: GeneratorContext
): { name: string; typeName: string; required?: boolean }[] {
  const required = property.min > 0;
  const typeName = fhirType.name;
  // In profiles, types that cannot be resolved fall back to the base type's property, e.g. Patient['gender']
  const getBaseProperty = (name: string): string | undefined =>
    options.profileInnerTypeNames ? `NonNullable<${fhirType.type}['${name}']>` : undefined;

  if ((typeName === 'BundleEntry' && path === 'resource') || (typeName === 'Reference' && path === 'resource')) {
    return [{ name: 'resource', typeName: 'T', required }];
  } else if (typeName === 'Bundle' && path === 'entry') {
    return [{ name: 'entry', typeName: 'BundleEntry<T>[]', required }];
  }

  const name = path.split('.').pop() as string;
  const result = [];
  if (name.endsWith('[x]')) {
    const baseName = name.replace('[x]', '');
    const propertyTypes = property.type as ElementDefinitionType[];
    for (const propertyType of propertyTypes) {
      const code = propertyType.code;
      const propertyName = baseName + capitalize(code);
      result.push({
        name: propertyName,
        typeName: getTypeScriptTypeForProperty(property, propertyType, path, options, getBaseProperty(propertyName)),
      });
    }
  } else {
    result.push({
      name,
      typeName: getTypeScriptTypeForProperty(property, property.type?.[0], path, options, getBaseProperty(name)),
      required,
    });
  }

  return result;
}

function generateJavadoc(b: FileBuilder, text: string | undefined): void {
  if (!text) {
    return;
  }

  b.append('/**');

  for (const textLine of text.split('\n')) {
    for (const javadocLine of wordWrap(textLine, 70)) {
      b.appendNoWrap(' ' + ('* ' + escapeHtml(javadocLine)).trim());
    }
  }

  b.append(' */');
}

function getTypeScriptTypeForProperty(
  property: InternalSchemaElement,
  typeDefinition: ElementDefinitionType,
  path: string,
  options: GeneratorContext,
  baseProperty: string | undefined
): string {
  let baseType = typeDefinition.code;
  let binding: string | undefined;

  switch (baseType) {
    case 'base64Binary':
    case 'canonical':
    case 'code':
    case 'id':
    case 'markdown':
    case 'oid':
    case 'string':
    case 'uri':
    case 'url':
    case 'uuid':
    case 'xhtml':
    case 'http://hl7.org/fhirpath/System.String':
      baseType = 'string';
      binding = property.binding?.valueSet;
      if (binding) {
        if (binding.startsWith('http://hl7.org/fhir/ValueSet/resource-types')) {
          baseType = 'ResourceType';
        } else if (
          binding !== 'http://hl7.org/fhir/ValueSet/all-types|4.0.1' &&
          binding !== 'http://hl7.org/fhir/ValueSet/defined-types|4.0.1' &&
          binding !== 'http://hl7.org/fhir/ValueSet/languages' &&
          binding !== 'http://hl7.org/fhir/ValueSet/defined-types'
        ) {
          const values = options.getValueSetValues?.(binding);
          if (values && values.length > 0) {
            baseType = "'" + values.join("' | '") + "'";
          } else if (baseProperty) {
            return baseProperty;
          }
        }
      }
      break;

    case 'date':
    case 'dateTime':
    case 'instant':
    case 'time':
    case 'integer64':
      baseType = 'string';
      break;

    case 'decimal':
    case 'integer':
    case 'positiveInt':
    case 'unsignedInt':
    case 'number':
      baseType = 'number';
      break;

    case 'ResourceList':
      baseType = 'Resource';
      break;

    case 'Element':
    case 'BackboneElement':
      baseType = buildTypeName(path.split('.'));
      break;

    case 'Reference':
      if (typeDefinition.targetProfile?.length) {
        const targetTypes = typeDefinition.targetProfile.map(getReferenceTargetType);
        if (baseProperty && targetTypes.includes(undefined)) {
          return baseProperty;
        }
        baseType += '<' + Array.from(new Set(targetTypes.map((t) => t ?? 'Resource'))).join(' | ') + '>';
      }
      break;
  }

  baseType = options.profileInnerTypeNames?.get(baseType) ?? baseType;

  // Profiles can restrict the cardinality of array elements (e.g. 0..1), but they are still arrays in JSON
  if (property.isArray ?? property.max > 1) {
    if (baseType.includes("' | '")) {
      return `(${baseType})[]`;
    }
    return baseType + '[]';
  }
  return baseType;
}

function getReferenceTargetType(targetProfile: string): string | undefined {
  const profile = tryGetProfile(targetProfile);
  if (profile) {
    return profile.type;
  }
  const typeName = targetProfile.split('/').pop() as string;
  return isResourceType(typeName) ? typeName : undefined;
}
