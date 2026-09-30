// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateTypeScriptDefinitions } from '@medplum/core';
import type { StructureDefinition } from '@medplum/fhirtypes';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MedplumCommand } from './utils';

export const generateTypes = new MedplumCommand('generate-types')
  .description('Generate TypeScript definitions from FHIR StructureDefinitions, such as profiles')
  .argument('<files...>', 'JSON files containing a StructureDefinition, an array of StructureDefinitions, or a Bundle')
  .option('-o, --output-dir <outputDir>', 'Output directory for the generated .d.ts files', '.')
  .action(async (files: string[], options) => {
    const sds: StructureDefinition[] = [];
    for (const file of files) {
      const json = JSON.parse(readFileSync(resolve(file), 'utf8'));
      const resources =
        json.resourceType === 'Bundle' ? (json.entry?.map((e: any) => e.resource) ?? []) : [json].flat();
      sds.push(...resources.filter((r: any) => r?.resourceType === 'StructureDefinition'));
    }

    const generated = Object.entries(generateTypeScriptDefinitions(sds));
    mkdirSync(options.outputDir, { recursive: true });
    for (const [fileName, contents] of generated) {
      writeFileSync(resolve(options.outputDir, fileName), contents, 'utf8');
    }
    console.log(`Generated ${generated.length - 1} type definitions in ${resolve(options.outputDir)}`);
  });
