import {
  buildTypeName,
  capitalize,
  getAllDataTypes,
  indexStructureDefinitionBundle,
  InternalTypeSchema,
  isLowerCase,
  isResourceTypeSchema,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, ElementDefinition, ElementDefinitionType } from '@medplum/fhirtypes';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { FileBuilder, wordWrap } from './filebuilder';
import { getValueSetValues } from './valuesets';

export function main(): void {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);

  mkdirSync(resolve(__dirname, '../../fhirtypes/dist'), { recursive: true });
  writeIndexFile();
  writeResourceFile();
  writeResourceTypeFile();

  for (const type of Object.values(getAllDataTypes())) {
    if (isResourceTypeSchema(type)) {
      writeInterfaceFile(type);
    }
  }
}

function writeIndexFile(): void {
  const names = Object.values(getAllDataTypes())
    .filter((t) => t.name !== 'DomainResource' && !t.parentType && !isLowerCase(t.name.charAt(0)))
    .map((t) => t.name as string);
  names.push('ResourceType');
  names.sort();

  const b = new FileBuilder();
  for (const resourceType of names) {
    b.append("export * from './" + resourceType + "';");
  }
  writeFileSync(resolve(__dirname, '../../fhirtypes/dist/index.d.ts'), b.toString(), 'utf8');
}

function writeResourceFile(): void {
  const names = Object.values(getAllDataTypes())
    .filter(isResourceTypeSchema)
    .map((t) => t.name as string)
    .sort();

  const b = new FileBuilder();
  for (const resourceType of names) {
    b.append('import { ' + resourceType + " } from './" + resourceType + "';");
  }
  b.newLine();
  for (let i = 0; i < names.length; i++) {
    if (i === 0) {
      b.append('export type Resource = ' + names[0]);
      b.indentCount++;
    } else if (i !== names.length - 1) {
      b.append('| ' + names[i]);
    } else {
      b.append('| ' + names[i] + ';');
    }
  }
  writeFileSync(resolve(__dirname, '../../fhirtypes/dist/Resource.d.ts'), b.toString(), 'utf8');
}

function writeResourceTypeFile(): void {
  const b = new FileBuilder();
  b.append("import { Resource } from './Resource';");
  b.newLine();
  b.append("export type ResourceType = Resource['resourceType'];");
  b.append('export type ExtractResource<K extends ResourceType> = Extract<Resource, { resourceType: K }>;');
  writeFileSync(resolve(__dirname, '../../fhirtypes/dist/ResourceType.d.ts'), b.toString(), 'utf8');
}

function writeInterfaceFile(fhirType: InternalTypeSchema): void {
  if (Object.values(fhirType.fields).length === 0) {
    return;
  }

  const includedTypes = new Set<string>();
  const referencedTypes = new Set<string>();
  buildImports(fhirType, includedTypes, referencedTypes);

  const b = new FileBuilder();
  for (const referencedType of Array.from(referencedTypes).sort()) {
    if (!includedTypes.has(referencedType)) {
      b.append('import { ' + referencedType + " } from './" + referencedType + "';");
    }
  }

  writeInterface(b, fhirType);
  writeFileSync(resolve(__dirname, '../../fhirtypes/dist/' + fhirType.name + '.d.ts'), b.toString(), 'utf8');
}

function writeInterface(b: FileBuilder, fhirType: InternalTypeSchema): void {
  if (Object.values(fhirType.fields).length === 0) {
    return;
  }

  const typeName = fhirType.name;
  const genericTypes = ['Bundle', 'BundleEntry', 'Reference'];
  const genericModifier = genericTypes.includes(typeName) ? '<T extends Resource = Resource>' : '';

  b.newLine();
  generateJavadoc(b, fhirType.description);
  b.append('export interface ' + typeName + genericModifier + ' {');
  b.indentCount++;

  if (fhirType.kind === 'resource') {
    b.newLine();
    generateJavadoc(b, `This is a ${typeName} resource`);
    b.append(`readonly resourceType: '${typeName}';`);
  }

  for (const property of Object.values(fhirType.fields)) {
    if (property.max === 0) {
      continue;
    }
    b.newLine();
    writeInterfaceProperty(b, fhirType, property.elementDefinition);
  }

  if (typeName === 'Reference') {
    b.newLine();
    generateJavadoc(b, 'Optional Resource referred to by this reference.');
    b.append('resource?: T;');
  }

  b.indentCount--;
  b.append('}');

  const subTypes = fhirType.innerTypes;
  if (subTypes) {
    subTypes.sort((t1, t2) => t1.name.localeCompare(t2.name));

    for (const subType of subTypes) {
      writeInterface(b, subType);
    }
  }
}

function writeInterfaceProperty(b: FileBuilder, fhirType: InternalTypeSchema, property: ElementDefinition): void {
  for (const typeScriptProperty of getTypeScriptProperties(property)) {
    b.newLine();
    generateJavadoc(b, property.definition);
    b.append(typeScriptProperty.name + '?: ' + typeScriptProperty.typeName + ';');
  }
}

function buildImports(fhirType: InternalTypeSchema, includedTypes: Set<string>, referencedTypes: Set<string>): void {
  const typeName = fhirType.name;
  includedTypes.add(typeName);

  for (const property of Object.values(fhirType.fields)) {
    for (const typeScriptProperty of getTypeScriptProperties(property.elementDefinition)) {
      cleanReferencedType(typeScriptProperty.typeName).forEach((cleanName) => referencedTypes.add(cleanName));
    }
  }

  const subTypes = fhirType.innerTypes;
  if (subTypes) {
    for (const subType of subTypes) {
      buildImports(subType, includedTypes, referencedTypes);
    }
  }

  if (typeName === 'Reference') {
    referencedTypes.add('Resource');
  }
}

function cleanReferencedType(typeName: string): string[] {
  if (typeName === 'T') {
    return ['Resource'];
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

function getTypeScriptProperties(property: ElementDefinition): { name: string; typeName: string }[] {
  if (property.path === 'Bundle.entry.resource' || property.path === 'Reference.resource') {
    return [{ name: 'resource', typeName: 'T' }];
  }

  if (property.path === 'Bundle.entry') {
    return [{ name: 'entry', typeName: 'BundleEntry<T>[]' }];
  }

  const name = (property.path as string).split('.').pop() as string;
  const result = [];
  if (property.contentReference) {
    const baseName = property.contentReference.replace('#', '').split('.').map(capitalize).join('');
    const typeName = property.max === '*' ? baseName + '[]' : baseName;
    result.push({ name, typeName });
  } else if (name.endsWith('[x]')) {
    const baseName = name.replace('[x]', '');
    const propertyTypes = property.type as ElementDefinitionType[];
    for (const propertyType of propertyTypes) {
      const code = propertyType.code as string;
      result.push({
        name: baseName + capitalize(code),
        typeName: getTypeScriptTypeForProperty(property, propertyType),
      });
    }
  } else {
    result.push({
      name,
      typeName: getTypeScriptTypeForProperty(property, property.type?.[0] as ElementDefinitionType),
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

function getTypeScriptTypeForProperty(property: ElementDefinition, typeDefinition: ElementDefinitionType): string {
  let baseType = typeDefinition.code as string;

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
      if (property.binding?.valueSet && property.binding.strength === 'required') {
        if (property.binding.valueSet === 'http://hl7.org/fhir/ValueSet/resource-types|4.0.1') {
          baseType = 'ResourceType';
        } else if (
          property.binding.valueSet !== 'http://hl7.org/fhir/ValueSet/all-types|4.0.1' &&
          property.binding.valueSet !== 'http://hl7.org/fhir/ValueSet/defined-types|4.0.1'
        ) {
          const values = getValueSetValues(property.binding.valueSet);
          if (values && values.length > 0) {
            baseType = "'" + values.join("' | '") + "'";
          }
        }
      }
      break;

    case 'date':
    case 'dateTime':
    case 'instant':
    case 'time':
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
      baseType = buildTypeName((property.path as string).split('.'));
      break;

    case 'Reference':
      if (typeDefinition.targetProfile && typeDefinition.targetProfile.length > 0) {
        baseType += '<';
        for (const targetProfile of typeDefinition.targetProfile) {
          if (!baseType.endsWith('<')) {
            baseType += ' | ';
          }
          baseType += targetProfile.split('/').pop();
        }
        baseType += '>';
      }
      break;
  }

  if (property.max === '*') {
    if (baseType.includes("' | '")) {
      return `(${baseType})[]`;
    }
    return baseType + '[]';
  }
  return baseType;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/“/g, '&ldquo;')
    .replace(/”/g, '&rdquo;')
    .replace(/‘/g, '&lsquo;')
    .replace(/’/g, '&rsquo;')
    .replace(/…/g, '&hellip;');
}

if (process.argv[1].endsWith('index.ts')) {
  main();
}
