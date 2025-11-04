// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'fs';
import { basename, resolve } from 'node:path';

export function readJson(filename: string): any {
  return JSON.parse(readFileSync(resolve(getDataDir(), filename), 'utf8'));
}

let dataDir: string | undefined = undefined;
export function getDataDir(): string {
  if (!dataDir) {
    // When running from src, the data directory is "../dist"
    // When running from dist/cjs or dist/esm, the data directory is ".."
    const currDir = import.meta.dirname;
    const relativePath = basename(currDir) === 'src' ? '../dist' : '..';
    dataDir = resolve(currDir, relativePath);
  }
  return dataDir;
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
