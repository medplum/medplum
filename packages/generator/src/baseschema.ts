import {
  BaseSchema,
  compressElement,
  getAllDataTypes,
  indexStructureDefinitionBundle,
  InternalTypeSchema,
  isLowerCase,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

export function main(): void {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);

  const allTypes = getAllDataTypes();
  const outputTypes: BaseSchema = Object.create(null);

  // For each type schema, only keep "display" and "properties"
  for (const [typeName, typeSchema] of Object.entries(allTypes).filter(([name, schema]) => isBaseType(name, schema))) {
    const output = { elements: Object.create(null) };
    for (const [propertyName, propertySchema] of Object.entries(typeSchema.elements)) {
      output.elements[propertyName] = compressElement(propertySchema);
    }
    outputTypes[typeName] = output;
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

function isBaseType(name: string, schema: InternalTypeSchema): boolean {
  return !isLowerCase(name.charAt(0)) && schema.kind !== 'resource' && schema.kind !== 'logical' && !schema.parentType;
}
