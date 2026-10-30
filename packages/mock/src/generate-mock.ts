// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ElementsContextType, InternalSchemaElement, InternalTypeSchema, WithId } from '@medplum/core';
import {
  buildElementsContext,
  capitalize,
  deepClone,
  deepEquals,
  deepIncludes,
  isEmpty,
  isPrimitiveType,
  parseStructureDefinition,
  tryGetDataType,
} from '@medplum/core';
import type { ExtractResource, ResourceType, StructureDefinition } from '@medplum/fhirtypes';
import generationCodes from './mocks/generation-codes.json';
import definitions from './mocks/structuredefinitions.json';

/** A resolved profile and typed values to use when generating required fields. */
export interface MockGenerationOptions<K extends ResourceType> {
  readonly profile?: StructureDefinition;
  readonly values?: Partial<ExtractResource<K>> | ((index: number) => Partial<ExtractResource<K>>);
  /** Use a distinct prefix when combining batches of the same resource type. */
  readonly idPrefix?: string;
}

/**
 * Generates deterministic mock resources, filling only missing required fields.
 * Profiles must include a resolved snapshot. References and ambiguous choices need authored values.
 * This helper does not guarantee full FHIR or profile conformance.
 * @param type - The resource type to generate.
 * @param count - Number of resources to generate.
 * @param options - Profile, authored values and a stable ID prefix.
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
  const bundled = (definitions as StructureDefinition[]).find((sd) => sd.type === type);
  const definition = options.profile ?? bundled;
  if (!definition) {
    throw new Error(`No bundled mock StructureDefinition for ${type}`);
  }
  if (options.profile && (definition.kind !== 'resource' || definition.type !== type)) {
    throw new Error(`Mock profile ${definition.url ?? definition.name} must describe resource type ${type}`);
  }
  if (!definition.snapshot?.element.length || definition.snapshot.element[0].path !== type) {
    throw new Error(`Mock ${type} profile needs a resolved snapshot rooted at ${type}`);
  }
  // The parser stops at unresolved content references; reject them rather than lose later fields.
  const seenPaths = new Set<string>();
  for (const element of definition.snapshot.element) {
    if (element.contentReference && !seenPaths.has(element.contentReference.replace(/^#/, ''))) {
      throw new Error(`Mock ${type} ${element.path}: unsupported forward or external content reference`);
    }
    seenPaths.add(element.path);
  }
  const schema = parseStructureDefinition(definition);
  const baseSchema = bundled && options.profile ? parseStructureDefinition(bundled) : schema;
  const requiredSlices = new Set(
    definition.snapshot.element.filter((ed) => ed.sliceName && (ed.min ?? 0) > 0).map((ed) => ed.path)
  );
  const bindings: Record<string, string> = generationCodes.bindings;
  const valueSets: Record<string, string[]> = generationCodes.valueSets;

  return Array.from({ length: count }, (_, index) => {
    const values = typeof options.values === 'function' ? options.values(index) : options.values;
    const resource = {
      ...deepClone(values ?? {}),
      resourceType: type,
      id: values?.id ?? `${options.idPrefix ?? type.toLowerCase()}-${index + 1}`,
    };
    fill(resource, schema, baseSchema, type);
    return resource as WithId<ExtractResource<K>>;

    function fail(path: string, message: string): never {
      throw new Error(`Mock ${type}[${index}] ${path}: ${message}`);
    }

    function fill(
      object: Record<string, unknown>,
      current: InternalTypeSchema,
      base: InternalTypeSchema,
      path: string,
      parentContext?: ElementsContextType,
      depth = 0
    ): void {
      if (depth > 32) {
        fail(path, 'required structure is recursive or too deep');
      }
      const context = buildElementsContext({ parentContext, path, elements: current.elements }) as ElementsContextType;
      for (const [key, element] of Object.entries(context.elements)) {
        if (key.includes('.')) {
          continue;
        }
        const fieldPath = `${path}.${key}`;
        const baseElement = base.elements[key];
        const variants = element.type.map((t) => key.replace('[x]', capitalize(t.code)));
        const allVariants = new Set([
          ...variants,
          ...(baseElement?.type ?? []).map((t) => key.replace('[x]', capitalize(t.code))),
        ]);
        const present = [...allVariants].filter((prop) => object[prop] !== undefined);
        if (present.length > 1 || present.some((prop) => !variants.includes(prop))) {
          fail(fieldPath, 'supply exactly one allowed choice variant');
        }
        if (requiredSlices.has(fieldPath) || element.slicing?.slices.some((slice) => slice.min > 0)) {
          fail(fieldPath, 'required slices are not supported');
        }
        if (!present.length && element.min === 0) {
          continue;
        }
        if (element.max === 0) {
          fail(fieldPath, 'the profile prohibits this field');
        }
        if (!present.length && key.includes('[x]') && variants.length !== 1) {
          fail(fieldPath, `supply a choice value or narrow its type in the profile (${variants.join(', ')})`);
        }
        const prop = present[0] ?? variants[0];
        const fieldType = element.type[variants.indexOf(prop)];
        // These two core Quantity profiles already have local datatype schemas.
        const datatypeProfile =
          fieldType?.profile?.length === 1
            ? fieldType.profile[0].match(
                /^http:\/\/hl7\.org\/fhir\/StructureDefinition\/(SimpleQuantity|MoneyQuantity)(?:\|[^|]+)?$/
              )?.[1]
            : undefined;
        if (
          !fieldType ||
          element.slicing ||
          (fieldType.profile?.length && !datatypeProfile) ||
          fieldType.targetProfile?.some(
            (url) =>
              !/^(?:(?:http:\/\/hl7\.org\/fhir|https:\/\/medplum\.com\/fhir)\/StructureDefinition\/)?[A-Z][A-Za-z]+$/.test(
                url.split('|')[0]
              )
          )
        ) {
          fail(fieldPath, 'slices and dependent profiles are not supported');
        }
        if (isPrimitiveType(fieldType.code) || fieldType.code === 'Resource') {
          for (const [childKey, child] of Object.entries(context.elements)) {
            if (!childKey.startsWith(key + '.')) {
              continue;
            }
            const parts = childKey.split('.');
            const required = parts.slice(1).every((_, index) => {
              const prefix = parts.slice(0, index + 2).join('.');
              return (context.elements[prefix]?.min ?? 0) > 0 || requiredSlices.has(`${path}.${prefix}`);
            });
            if (required && (child.min > 0 || requiredSlices.has(`${path}.${childKey}`))) {
              fail(
                `${path}.${childKey}`,
                `required ${fieldType.code === 'Resource' ? 'contained resource' : 'primitive'} child constraints are not supported`
              );
            }
          }
        }
        // Profile max=1 does not change the JSON representation of a base repeating field.
        const isArray = baseElement?.isArray ?? element.isArray;
        const make = (): unknown => sample(fieldType.code, element, fieldPath, `${base.type}.${key}`);
        if (object[prop] === undefined) {
          object[prop] = isArray ? [] : make();
        }
        if (Array.isArray(object[prop]) !== Boolean(isArray)) {
          fail(fieldPath, isArray ? 'expected an array' : 'expected a single value');
        }
        const items = isArray ? (object[prop] as unknown[]) : [object[prop]];
        if (items.length > element.max) {
          fail(fieldPath, `expected at most ${element.max} entries`);
        }
        while (items.length < element.min) {
          items.push(make());
        }
        if (items.length === 0) {
          fail(fieldPath, 'omit an optional empty array or supply a value');
        }
        for (const item of items) {
          if (!isPrimitiveType(fieldType.code) && (!item || typeof item !== 'object' || Array.isArray(item))) {
            fail(fieldPath, 'expected an object');
          }
          if (!isPrimitiveType(fieldType.code) && fieldType.code !== 'Resource') {
            const child =
              schema.innerTypes.find((inner) => inner.name === fieldType.code) ??
              tryGetDataType(datatypeProfile ?? fieldType.code);
            if (!child) {
              fail(fieldPath, `unsupported datatype ${fieldType.code}`);
            }
            const baseChild = baseSchema.innerTypes.find((inner) => inner.name === fieldType.code) ?? child;
            // Context paths retain [x]; only the JSON property uses the concrete variant name.
            fill(item as Record<string, unknown>, child, baseChild, fieldPath, context, depth + 1);
          }
          if (isEmpty(item)) {
            fail(fieldPath, 'supply a value or require a child field in the profile');
          }
          const typed = { type: fieldType.code, value: item };
          if (element.fixed && !deepEquals(typed, element.fixed)) {
            fail(fieldPath, 'value conflicts with fixed value');
          }
          if (element.pattern && !deepIncludes(typed, element.pattern)) {
            fail(fieldPath, 'value does not include the required pattern');
          }
        }
      }
    }

    function sample(code: string, element: InternalSchemaElement, path: string, basePath: string): unknown {
      const specified = element.fixed ?? element.pattern;
      if (specified) {
        return deepClone(specified.value);
      }
      if (code === 'Resource') {
        return fail(path, 'supply a resource in values');
      }
      if (code === 'Reference') {
        return fail(path, 'supply an explicit reference in values');
      }
      if (!isPrimitiveType(code)) {
        return {};
      }
      switch (code) {
        case 'code': {
          const canonical = element.binding?.valueSet ?? bindings[element.path] ?? bindings[basePath];
          const matches =
            canonical && !canonical.includes('|')
              ? Object.keys(valueSets).filter((url) => url.split('|')[0] === canonical)
              : [];
          const choices = valueSets[canonical] ?? (matches.length === 1 ? valueSets[matches[0]] : undefined);
          if (!choices?.length) {
            return fail(path, 'no unambiguous local code list; supply its value');
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
          return `Example ${path.slice(type.length + 1).replaceAll('[x]', '')} ${index + 1}`;
        default:
          return fail(path, `unsupported primitive ${code}; supply its value`);
      }
    }
  });
}
