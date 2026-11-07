// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateTypeScriptDefinitions } from '@medplum/core';
import type { StructureDefinition } from '@medplum/fhirtypes';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMedplumClient } from './util/client';
import { MedplumCommand } from './utils';

export const generateTypes = new MedplumCommand('generate-types')
  .description('Generate TypeScript definitions from FHIR StructureDefinitions, such as profiles')
  .argument('[files...]', 'JSON files containing a StructureDefinition, an array of StructureDefinitions, or a Bundle')
  .option(
    '--profile-url <url>',
    'Canonical URL of a StructureDefinition to fetch from the Medplum server. Can be repeated.',
    (url: string, urls: string[]) => [...urls, url],
    []
  )
  .option('-o, --output-dir <outputDir>', 'Output directory for the generated .d.ts files', '.')
  .action(async (files: string[], options) => {
    const profileUrls: string[] = options.profileUrl;
    if (files.length === 0 && profileUrls.length === 0) {
      throw new Error('At least one file or --profile-url is required');
    }

    const sds: StructureDefinition[] = [];
    for (const file of files) {
      const json = JSON.parse(readFileSync(resolve(file), 'utf8'));
      const resources =
        json.resourceType === 'Bundle' ? (json.entry?.map((e: any) => e.resource) ?? []) : [json].flat();
      sds.push(...resources.filter((r: any) => r?.resourceType === 'StructureDefinition'));
    }

    if (profileUrls.length > 0) {
      const medplum = await createMedplumClient(options);
      for (const url of profileUrls) {
        const sd = await medplum.searchOne('StructureDefinition', { url, _sort: '-_lastUpdated' });
        if (!sd) {
          throw new Error(`StructureDefinition not found: ${url}`);
        }
        sds.push(sd);
      }
    }

    const generated = Object.entries(generateTypeScriptDefinitions(sds));
    mkdirSync(options.outputDir, { recursive: true });
    for (const [fileName, contents] of generated) {
      writeFileSync(resolve(options.outputDir, fileName), contents, 'utf8');
    }
    console.log(`Generated ${generated.length - 1} type definitions in ${resolve(options.outputDir)}`);
  });
