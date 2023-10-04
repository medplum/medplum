import {
  getAllDataTypes,
  indexStructureDefinitionBundle,
  InternalSchemaElement,
  InternalTypeSchema,
  isLowerCase,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const normalizedTypes: Record<string, string> = {
  'http://hl7.org/fhirpath/System.String': 'string',
};

export function main(): void {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);

  const allTypes = getAllDataTypes();
  const outputTypes = {} as Record<string, InternalTypeSchema>;

  // Remove all primitive types and resource types
  for (const [typeName, typeSchema] of Object.entries(allTypes)) {
    if (isLowerCase(typeName.charAt(0)) || typeSchema.kind === 'resource') {
      delete allTypes[typeName];
    } else {
      outputTypes[typeName] = typeSchema;
    }
  }

  // For each type schema, only keep "display" and "properties"
  for (const [typeName, typeSchema] of Object.entries(outputTypes)) {
    outputTypes[typeName] = {
      name: typeSchema.name,
      elements: typeSchema.elements,
    } as InternalTypeSchema;

    // For each property, only keep "min", "max", and "type"
    // Only keep "min" if not 0
    // Only keep "max" if not 1
    for (const [propertyName, propertySchema] of Object.entries(typeSchema.elements)) {
      const outputPropertySchema: Partial<InternalSchemaElement> = {};

      if (propertySchema.min !== 0) {
        outputPropertySchema.min = propertySchema.min;
      }

      if (propertySchema.max !== 1 && Number.isFinite(propertySchema.max)) {
        outputPropertySchema.max = propertySchema.max;
      } else if (propertySchema.max === Number.POSITIVE_INFINITY) {
        outputPropertySchema.max = Number.MAX_SAFE_INTEGER;
      }

      outputPropertySchema.type = propertySchema.type?.map((t) => ({
        ...t,
        extension: undefined,
        code: normalizedTypes[t.code as string] || t.code,
      }));

      typeSchema.elements[propertyName] = outputPropertySchema as InternalSchemaElement;
    }
  }

  writeFileSync(
    resolve(__dirname, '../../core/src/base-schema.json'),
    JSON.stringify(outputTypes, undefined, 2),
    'utf8'
  );
}

if (require.main === module) {
  main();
}
