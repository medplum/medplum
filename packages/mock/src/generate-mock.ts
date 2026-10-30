// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { InternalSchemaElement, InternalTypeSchema, WithId } from '@medplum/core';
import {
  applyDefaultValuesToResource,
  capitalize,
  deepClone,
  getDataType,
  isPrimitiveType,
  parseStructureDefinition,
} from '@medplum/core';
import type { ExtractResource, Resource, ResourceType, StructureDefinition } from '@medplum/fhirtypes';
import generationCodes from './mocks/generation-codes.json';
import definitions from './mocks/structuredefinitions.json';

/** Values to preserve and optional field paths to fill, such as `name.given` or `birthDate`. */
export interface MockGenerationOptions<K extends ResourceType> {
  readonly fields?: readonly string[];
  readonly values?: Partial<ExtractResource<K>> | ((index: number) => Partial<ExtractResource<K>>);
  /** Use a distinct prefix when combining batches of the same resource type. */
  readonly idPrefix?: string;
}

/**
 * Generates deterministic screen data from bundled base FHIR StructureDefinitions.
 * Required fields and requested optional fields are filled; authored values are preserved.
 * Reference placeholders do not create links. Clinical values and links belong to the author.
 * @param type - A resource type included in the mock package's bundled definitions.
 * @param count - Number of resources to generate.
 * @param options - Requested fields, authored values and a stable ID prefix.
 * @returns Typed resources with stable IDs, ready for createMockState.
 */
export function generateMockResources<K extends ResourceType>(
  type: K,
  count: number,
  options: MockGenerationOptions<K> = {}
): WithId<ExtractResource<K>>[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Mock resource count must be a nonnegative integer');
  }
  const definition = (definitions as StructureDefinition[]).find((sd) => sd.type === type);
  if (!definition) {
    throw new Error(`No bundled mock StructureDefinition for ${type}`);
  }
  const schema = parseStructureDefinition(definition);
  const bindings: Record<string, string> = generationCodes.bindings;
  const valueSets: Record<string, string[]> = generationCodes.valueSets;
  return Array.from({ length: count }, (_, index) => {
    const values = deepClone(typeof options.values === 'function' ? options.values(index) : (options.values ?? {}));
    const resource = applyDefaultValuesToResource({ ...values, resourceType: type } as Resource, schema);
    resource.id ??= `${options.idPrefix ?? type.toLowerCase()}-${index + 1}`;
    const unmatched = new Set(options.fields ?? []);
    fill(resource as unknown as Record<string, unknown>, schema, '', 0);
    if (unmatched.size) {
      throw new Error(`Unknown or unsupported mock field: ${[...unmatched].join(', ')}`);
    }
    // The schema determines the output shape; tests check required fields and choice handling.
    return resource as WithId<ExtractResource<K>>;

    function fill(object: Record<string, unknown>, current: InternalTypeSchema, parent: string, depth: number): void {
      if (depth > 8) {
        throw new Error(`Required mock structure is recursive at ${current.path}; supply a value`);
      }
      for (const [key, element] of Object.entries(current.elements)) {
        if (key.includes('.') || element.max === 0) {
          continue;
        }
        const variants = element.type.map((t) => key.replace('[x]', capitalize(t.code)));
        const present = [...new Set(variants)].filter((prop) => object[prop] !== undefined);
        if (present.length > 1) {
          throw new Error(`Multiple choice values at ${element.path}`);
        }
        const selected = present[0] ?? variants.find((prop) => requested(join(parent, prop))) ?? variants[0];
        const path = join(parent, selected);
        const wanted = requested(path);
        if (object[selected] === undefined && element.min === 0 && !wanted) {
          continue;
        }
        unmatched.delete(path);
        const fieldType = element.type[variants.indexOf(selected)];
        if (!fieldType || element.slicing || fieldType.profile?.length) {
          throw new Error(`Unsupported mock structure at ${element.path}; supply this resource explicitly`);
        }
        const generated = object[selected] === undefined;
        if (generated) {
          const make = (): unknown => sample(fieldType.code, element, path);
          object[selected] = element.isArray ? Array.from({ length: Math.max(1, element.min) }, make) : make();
        }
        if (!isPrimitiveType(fieldType.code)) {
          const child = schema.innerTypes.find((inner) => inner.name === fieldType.code) ?? getDataType(fieldType.code);
          const children = element.isArray ? (object[selected] as unknown[]) : [object[selected]];
          for (const value of children) {
            fill(value as Record<string, unknown>, child, path, depth + 1);
            if (generated && Object.keys(value as object).length === 0) {
              throw new Error(`No generated value at ${path}; request its child fields or supply a value`);
            }
          }
        }
      }
    }

    function requested(path: string): boolean {
      return (options.fields ?? []).some((field) => field === path || field.startsWith(path + '.'));
    }

    function sample(code: string, element: InternalSchemaElement, path: string): unknown {
      if (code === 'Reference') {
        return { display: `Example ${path} ${index + 1}` };
      }
      if (code === 'CodeableConcept') {
        return { text: `Example ${path} ${index + 1}` };
      }
      if (!isPrimitiveType(code)) {
        const child = schema.innerTypes.find((inner) => inner.name === code) ?? getDataType(code);
        // A requested whole datatype gets its ordinary display/value field. Nested paths
        // remain precise: requesting name.given does not also generate name.family.
        if (options.fields?.includes(path)) {
          const property = ['text', 'display', 'value'].find((name) => child.elements[name]);
          if (property) {
            const field = child.elements[property];
            return { [property]: sample(field.type[0].code, field, join(path, property)) };
          }
        }
        return {};
      }
      switch (code) {
        case 'code': {
          const choices = valueSets[bindings[element.path]];
          if (!choices?.length) {
            throw new Error(`No bundled code choices for ${element.path}; supply its value`);
          }
          return choices[index % choices.length];
        }
        case 'boolean':
          return true;
        case 'decimal':
        case 'integer':
        case 'positiveInt':
        case 'unsignedInt':
          return index + 1;
        case 'date':
          return '2020-05-04';
        case 'dateTime':
        case 'instant':
          return '2020-05-04T12:05:00.000Z';
        case 'time':
          return '12:05:00';
        case 'id':
          return `example-${index + 1}`;
        case 'uri':
        case 'url':
        case 'canonical':
          return `https://example.com/${index + 1}`;
        case 'string':
        case 'markdown':
          return `Example ${path} ${index + 1}`;
        default:
          throw new Error(`Unsupported mock primitive ${code} at ${element.path}; supply its value`);
      }
    }
  });
}

function join(parent: string, property: string): string {
  return parent ? `${parent}.${property}` : property;
}
