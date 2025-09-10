// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readJson(filename: string): any {
  return JSON.parse(readFileSync(resolve(getDataDir(), filename), 'utf8'));
}

let dataDir: string | undefined = undefined;
export function getDataDir(): string {
  if (!dataDir) {
    // When running from src, the data directory is "../dist"
    // When running from dist/cjs or dist/esm, the data directory is ".."
    const currDir = getDirName();
    const relativePath = basename(currDir) === 'src' ? '../dist' : '..';
    dataDir = resolve(currDir, relativePath);
  }
  return dataDir;
}

/**
 * Returns the directory name of the current module.
 * Works with both CommonJS and ES modules.
 * @returns The directory name of the current module.
 */
function getDirName(): string {
  return typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
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
