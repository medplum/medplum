import {
  capitalize,
  getAllDataTypes,
  indexStructureDefinitionBundle,
  InternalSchemaElement,
  InternalTypeSchema,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, ElementDefinitionType, StructureDefinition } from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
import { JSONSchema6, JSONSchema6Definition } from 'json-schema';
import { resolve } from 'path';
import { getValueSetValues } from './valuesets';

// Generate fhir.schema.json
//
// The FHIR spec "Downloads" page includes "whole specification", which includes "fhir.schema.json".
// We extend the "fhir.schema.json" file with Medplum-specific extensions.
// See: https://hl7.org/fhir/R4/downloads.html
//
// This tool *could* be used to generate all of "fhir.schema.json", however -
// there are a number of inconsistencies in the original version that appear to be the result of
// evolution rather than intentional design.
//
// For example
//  1. Sometimes the "id" element is defined as a "string" rather than "id" type.
//  2. Sometimes "resourceType" is a required field
//  3. Sometimes properties include "pattern" with the regex definition of primitive type.
//  4. Sometimes properties embed enum values vs use "code".
//
// Rather than risk breaking existing tools, we extend the existing schema with Medplum-specific definitions.
// This allows us to use the existing schema as a starting point, and only add new definitions.

interface FhirSchema extends JSONSchema6 {
  id: 'http://hl7.org/fhir/json-schema/4.0';
  discriminator: {
    propertyName: 'resourceType';
    mapping: Record<string, string>;
  };
  oneOf: JSONSchema6Definition[];
  definitions: {
    ResourceList: {
      oneOf: JSONSchema6Definition[];
    };
    [k: string]: JSONSchema6Definition;
  };
}

export function main(): void {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);

  const medplumBundle = readJson('fhir/r4/profiles-medplum.json') as Bundle<StructureDefinition>;
  const medplumTypes = medplumBundle.entry?.map((e) => e.resource?.id) ?? [];
  indexStructureDefinitionBundle(medplumBundle);

  // Start with the existing schema
  const fhirSchema = readJson('fhir/r4/fhir.schema.json') as FhirSchema;

  // Then add element types
  for (const typeSchema of Object.values(getAllDataTypes())) {
    const typeName = typeSchema.name;
    if (medplumTypes.includes(typeName)) {
      if (!fhirSchema.discriminator.mapping[typeName]) {
        fhirSchema.discriminator.mapping[typeName] = `#/definitions/${typeName}`;
      }
      if (!fhirSchema.oneOf.find((x) => typeof x === 'object' && x.$ref === `#/definitions/${typeName}`)) {
        fhirSchema.oneOf.push({ $ref: `#/definitions/${typeName}` });
      }
      if (
        !fhirSchema.definitions.ResourceList.oneOf.find(
          (x) => typeof x === 'object' && x.$ref === `#/definitions/${typeName}`
        )
      ) {
        fhirSchema.definitions.ResourceList.oneOf.push({ $ref: `#/definitions/${typeName}` });
      }
      fhirSchema.definitions[typeName] = buildElementSchema(typeSchema);
    }
  }

  writeFileSync(
    resolve(__dirname, '../../definitions/dist/fhir/r4/fhir.schema.json'),
    JSON.stringify(fhirSchema, undefined, 2)
      .replaceAll("'", '\\u0027')
      .replaceAll('<', '\\u003c')
      .replaceAll('=', '\\u003d')
      .replaceAll('>', '\\u003e'),
    'utf8'
  );
}

function buildElementSchema(typeSchema: InternalTypeSchema): JSONSchema6Definition {
  const { properties, required } = buildProperties(typeSchema);
  return {
    description: typeSchema.description,
    properties,
    additionalProperties: false,
    required,
  };
}

function buildProperties(typeSchema: InternalTypeSchema): {
  properties: Record<string, JSONSchema6Definition>;
  required: string[] | undefined;
} {
  const properties: Record<string, JSONSchema6Definition> = {};
  let required: string[] | undefined = undefined;

  if (typeSchema.kind === 'resource') {
    properties['resourceType'] = {
      description: `This is a ${typeSchema.name} resource`,
      const: typeSchema.name,
    };
    required = ['resourceType'];
  }

  for (const [path, elementDefinition] of Object.entries(typeSchema.elements)) {
    for (const elementDefinitionType of elementDefinition?.type ?? []) {
      const propertyName = path.replace('[x]', capitalize(elementDefinitionType.code as string));
      properties[propertyName] = buildPropertySchema(elementDefinition, elementDefinitionType, path);
    }

    if (!path.includes('[x]') && elementDefinition?.min) {
      if (!required) {
        required = [];
      }
      required.push(path);
    }
  }

  return { properties, required };
}

function buildPropertySchema(
  elementDefinition: InternalSchemaElement,
  elementDefinitionType: ElementDefinitionType,
  path: string
): JSONSchema6Definition {
  const result: JSONSchema6Definition = {
    description: elementDefinition.description,
  };

  const enumValues = getEnumValues(elementDefinition);

  if (elementDefinition.max > 1) {
    result.items = {};
    if (enumValues) {
      result.items.enum = enumValues;
    } else {
      result.items.$ref = `#/definitions/${getTypeName(path, elementDefinitionType)}`;
    }
    result.type = 'array';
  } else if (enumValues) {
    result.enum = enumValues;
  } else {
    result.$ref = `#/definitions/${getTypeName(path, elementDefinitionType)}`;
  }

  return result;
}

function getTypeName(path: string, elementDefinitionType: ElementDefinitionType): string {
  if (path.endsWith('.id')) {
    return 'id';
  }
  const code = elementDefinitionType.code as string;
  return code === 'BackboneElement' || code === 'Element' ? buildTypeName(path.split('.') as string[]) : code;
}

function buildTypeName(components: string[]): string {
  if (components.length === 1) {
    return components[0];
  }
  return components.map(capitalize).join('_');
}

const excludedValueSets = [
  'http://hl7.org/fhir/ValueSet/resource-types|4.0.1',
  'http://hl7.org/fhir/ValueSet/all-types|4.0.1',
  'http://hl7.org/fhir/ValueSet/defined-types|4.0.1',
];
function getEnumValues(elementDefinition: InternalSchemaElement): string[] | undefined {
  const valueSet = elementDefinition.binding?.valueSet;
  if (valueSet) {
    if (!excludedValueSets.includes(valueSet)) {
      const values = getValueSetValues(valueSet);
      if (values && values.length > 0) {
        return values;
      }
    }
  }
  return undefined;
}

if (require.main === module) {
  main();
}
