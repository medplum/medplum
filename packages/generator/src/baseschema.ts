import { globalSchema, indexStructureDefinitionBundle, isLowerCase, TypeSchema } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, ElementDefinition } from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const normalizedTypes: Record<string, string> = {
  'http://hl7.org/fhirpath/System.String': 'string',
};

export function main(): void {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);

  // Remove all primitive types and resource types
  for (const [typeName, typeSchema] of Object.entries(globalSchema.types)) {
    if (isLowerCase(typeName.charAt(0)) || typeSchema.structureDefinition.kind === 'resource') {
      delete globalSchema.types[typeName];
    }
  }

  // For each type schema, only keep "display" and "properties"
  for (const [typeName, typeSchema] of Object.entries(globalSchema.types)) {
    globalSchema.types[typeName] = {
      display: typeSchema.display,
      properties: typeSchema.properties,
    } as TypeSchema;

    // For each property, only keep "min", "max", and "type"
    // Only keep "min" if not 0
    // Only keep "max" if not 1
    for (const [propertyName, propertySchema] of Object.entries(typeSchema.properties)) {
      const outputPropertySchema: Partial<ElementDefinition> = {};

      if (propertySchema.min !== 0) {
        outputPropertySchema.min = propertySchema.min;
      }

      if (propertySchema.max !== '1') {
        outputPropertySchema.max = propertySchema.max;
      }

      outputPropertySchema.type = propertySchema.type?.map((t) => ({
        ...t,
        extension: undefined,
        code: normalizedTypes[t.code as string] || t.code,
      }));

      globalSchema.types[typeName].properties[propertyName] = outputPropertySchema;
    }
  }

  writeFileSync(
    resolve(__dirname, '../../core/src/base-schema.json'),
    JSON.stringify(globalSchema, undefined, 2),
    'utf8'
  );
}

if (require.main === module) {
  main();
}
