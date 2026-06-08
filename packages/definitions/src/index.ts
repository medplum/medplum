// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BundleEntry } from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readJson(filename: string): any {
  const filenamePath = resolve(getDataDir(), filename);
  return JSON.parse(readFileSync(filenamePath, 'utf8'));
}

export async function readJsonAsync(filename: string): Promise<any> {
  const filenamePath = resolve(getDataDir(), filename);
  const data = await readFile(filenamePath, 'utf8');
  return JSON.parse(data);
}

let cachedDataDir: string | undefined = undefined;

export function getDataDir(): string {
  if (cachedDataDir) {
    return cachedDataDir;
  }

  const currentDir = getCurrentDir();

  // Need to handle the following cases:
  // v4 and earlier: `index.js` in `dist/`, data in `dist/fhir/`
  // v5.0.0: data in `index.js` in `dist/cjs/` and `dist/esm/`, data in `/dist/cjs/fhir/` and `/dist/esm/fhir/`
  // v5.0.1 and after: `index.js` in `dist/cjs/` and `dist/esm/`, data back in `/dist/fhir/`
  const relativePaths = ['./', '../', './cjs/', './esm/'];
  for (const relativePath of relativePaths) {
    const fullPath = resolve(currentDir, relativePath);
    const fhirPath = resolve(fullPath, 'fhir');
    if (existsSync(fhirPath)) {
      cachedDataDir = fullPath;
      return fullPath;
    }
  }
  throw new Error('No data directory found');
}

function getCurrentDir(): string {
  if (typeof __dirname !== 'undefined') {
    return resolve(__dirname);
  } else if (import.meta.url) {
    return resolve(dirname(fileURLToPath(import.meta.url)));
  } else {
    throw new Error('No data directory found');
  }
}

export async function processBaseDefinitions(
  files: string[],
  callback: (entry: BundleEntry) => Promise<void>
): Promise<void> {
  for (const filename of files) {
    for (const entry of (await readJsonAsync(filename)).entry as BundleEntry[]) {
      await callback(entry);
    }
  }
}

/**
 * The list of all known search parameter definition bundle file paths relative to the
 * `@medplum/definitions` package. Typically used in conjunction with `readJson`.
 */
export const SEARCH_PARAMETER_BUNDLE_FILES = [
  'fhir/r4/search-parameters.json',
  'fhir/r4/search-parameters-medplum.json',
  'fhir/r4/search-parameters-uscore.json',
];

export const STRUCTURE_DEFINITION_BUNDLE_FILES = [
  'fhir/r4/profiles-types.json',
  'fhir/r4/profiles-resources.json',
  'fhir/r4/profiles-medplum.json',
  'fhir/r4/profiles-others.json',
];

export const TERMINOLOGY_BUNDLE_FILES = [
  'fhir/r4/v2-tables.json',
  'fhir/r4/v3-codesystems.json',
  'fhir/r4/valuesets.json',
  'fhir/r4/valuesets-medplum.json',
  'fhir/r4/valuesets-medplum-generated.json',
];
