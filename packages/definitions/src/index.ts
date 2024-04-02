import { readFileSync } from 'fs';
import { resolve } from 'path';

export function readJson(filename: string): any {
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
