// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { InternalTypeSchema } from '@medplum/core';
import {
  FileBuilder,
  generateTypeScriptDefinition,
  getAllDataTypes,
  indexStructureDefinitionBundle,
  isLowerCase,
  isResourceTypeSchema,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { Bundle } from '@medplum/fhirtypes';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getValueSetValues } from './valuesets';

export function main(): void {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);

  mkdirSync(resolve(import.meta.dirname, '../../fhirtypes/dist'), { recursive: true });
  writeIndexFile();
  writeResourceFile();
  writeResourceTypeFile();

  for (const type of Object.values(getAllDataTypes())) {
    if (isResourceTypeSchema(type) || type.kind === 'complex-type' || type.kind === 'logical') {
      writeInterfaceFile(type);
    }
  }
}

function writeIndexFile(): void {
  const names = Object.values(getAllDataTypes())
    .filter((t) => t.name !== 'DomainResource' && !t.parentType && !isLowerCase(t.name.charAt(0)))
    .map((t) => t.name);
  names.push('ResourceType');
  names.sort();

  const b = new FileBuilder();
  for (const resourceType of names) {
    b.append("export type * from './" + resourceType + ".d.ts';");
  }
  writeFileSync(resolve(import.meta.dirname, '../../fhirtypes/dist/index.d.ts'), b.toString(), 'utf8');
}

function writeResourceFile(): void {
  const names = Object.values(getAllDataTypes())
    .filter(isResourceTypeSchema)
    .map((t) => t.name)
    .sort();

  const b = new FileBuilder();
  for (const resourceType of names) {
    b.append('import type { ' + resourceType + " } from './" + resourceType + ".d.ts';");
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
  writeFileSync(resolve(import.meta.dirname, '../../fhirtypes/dist/Resource.d.ts'), b.toString(), 'utf8');
}

function writeResourceTypeFile(): void {
  const b = new FileBuilder();
  b.append("import type { Resource } from './Resource.d.ts';");
  b.newLine();
  b.append("export type ResourceType = Resource['resourceType'];");
  b.append('export type ExtractResource<K extends ResourceType> = Extract<Resource, { resourceType: K }>;');
  writeFileSync(resolve(import.meta.dirname, '../../fhirtypes/dist/ResourceType.d.ts'), b.toString(), 'utf8');
}

function writeInterfaceFile(fhirType: InternalTypeSchema): void {
  const contents = generateTypeScriptDefinition(fhirType, { getValueSetValues });
  if (contents) {
    writeFileSync(resolve(import.meta.dirname, '../../fhirtypes/dist/' + fhirType.name + '.d.ts'), contents, 'utf8');
  }
}

if (import.meta.main) {
  main();
}
