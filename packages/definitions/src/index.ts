// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'fs';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readJson(filename: string): any {
  const filenamePath = resolve(getDataDir(), filename);
  return JSON.parse(readFileSync(filenamePath, 'utf8'));
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

/**
 * The list of all known search parameter definition bundle file paths relative to the
 * `@medplum/definitions` package. Typically used in conjunction with `readJson`.
 */
export const SEARCH_PARAMETER_BUNDLE_FILES = [
  'fhir/r4/search-parameters.json',
  'fhir/r4/search-parameters-medplum.json',
  'fhir/r4/search-parameters-uscore.json',
];
