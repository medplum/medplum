// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'node:path';


export function readJson(filename: string): any {
  const filenamePath = resolve(getDataDir(), filename);
  return JSON.parse(readFileSync(filenamePath, 'utf8'));
}

export function getDataDir(): string {
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
