import { readFileSync } from 'fs';
import { resolve } from 'path';

export function readJson(filename: string): any {
  return JSON.parse(readFileSync(resolve(__dirname, filename), 'utf8'));
}

/**
 * The list of all known search parameter definition bundles
 * filenames from `@medplum/definitions`.
 */
export const SEARCH_PARAMETER_BUNDLE_FILES = [
  'fhir/r4/search-parameters.json',
  'fhir/r4/search-parameters-medplum.json',
  'fhir/r4/search-parameters-uscore.json',
];
