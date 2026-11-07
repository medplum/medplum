// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { InternalTypeSchema } from '@medplum/core';
import {
  FileBuilder,
  generateTypeScriptDefinition,
  getLogicalTypeName,
  indexStructureDefinitionBundle,
  tryGetProfile,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { Bundle, StructureDefinition } from '@medplum/fhirtypes';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUTPUT_DIR = resolve(import.meta.dirname, '../../ccda/src');

/**
 * Generates the `@medplum/ccda` types and element table from the CDA logical model, named the way
 * the XML parser names them ("@_" attributes, "#text" content).
 */
export function main(): void {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);

  const bundle = readJson('fhir/cda/hl7.cda.uv.core-2.0.0-sd.json') as Bundle<StructureDefinition>;
  const sds = (bundle.entry ?? []).map((e) => e.resource as StructureDefinition);
  indexStructureDefinitionBundle(sds, { xmlPropertyNames: true });

  const schemas = sds
    .filter((sd) => sd.kind === 'logical')
    .map((sd) => tryGetProfile(sd.url) as InternalTypeSchema)
    .sort((a, b) => a.name.localeCompare(b.name));

  writeTypes(schemas);
  writeElements(schemas);
}

function writeTypes(schemas: InternalTypeSchema[]): void {
  const b = new FileBuilder();
  for (const schema of schemas) {
    const contents = generateTypeScriptDefinition(schema, { logicalTypePrefix: 'Cda' });
    if (contents) {
      // Strip the per-file header and imports; all types live in this one file
      const body = contents.slice(contents.indexOf('*/') + 2).replace(/^import type .*$/gm, '');
      b.appendNoWrap(body.trim());
      b.newLine();
    }
  }
  writeFileSync(resolve(OUTPUT_DIR, 'cda-types.ts'), b.toString(), 'utf8');
}

/**
 * Writes, for each CDA type, its child elements and whether each repeats. The XML parser uses this
 * to decide which elements are arrays, and which type to descend into.
 * @param schemas - The CDA type schemas.
 */
function writeElements(schemas: InternalTypeSchema[]): void {
  const table: Record<string, Record<string, string>> = {};
  const add = (schema: InternalTypeSchema): void => {
    const elements: Record<string, string> = {};
    for (const [name, element] of Object.entries(schema.elements)) {
      if (element.xmlAttribute || name === '#text' || name.includes('.') || element.max === 0) {
        continue;
      }
      const code = element.type[0]?.code ?? '';
      const type = code.includes('/') ? getLogicalTypeName(code) : '';
      elements[name] = type + (element.isArray || element.max > 1 ? '[]' : '');
    }
    table[getLogicalTypeName(schema.name)] = elements;
    schema.innerTypes.forEach(add);
  };
  schemas.forEach(add);

  const b = new FileBuilder();
  b.append('/**');
  b.append(' * Child elements of each CDA type: the element type name, with "[]" if the element repeats.');
  b.append(' * The type name is empty for elements that are not CDA types, such as narrative text.');
  b.append(' */');
  b.append('export const CDA_ELEMENTS: Record<string, Record<string, string>> = ' + JSON.stringify(table) + ';');
  writeFileSync(resolve(OUTPUT_DIR, 'cda-elements.ts'), b.toString(), 'utf8');
}

if (import.meta.main) {
  main();
}
