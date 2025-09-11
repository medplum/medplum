// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export function readJson(filename: string): any {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return JSON.parse(readFileSync(resolve(__dirname, filename), 'utf8'));
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
