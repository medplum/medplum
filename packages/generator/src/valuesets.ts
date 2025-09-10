// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import {
  Bundle,
  BundleEntry,
  CodeSystem,
  CodeSystemConcept,
  Resource,
  ValueSet,
  ValueSetCompose,
} from '@medplum/fhirtypes';
import csv from 'csv-parser';
import { createReadStream, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const valueSets = new Map<string, CodeSystem | ValueSet>();

export function getValueSetValues(url: string): string[] {
  if (valueSets.size === 0) {
    const files = [
      'valuesets.json',
      'v2-tables.json',
      'v3-codesystems.json',
      'valuesets-medplum.json',
      'valuesets-medplum-generated.json',
    ];
    for (const file of files) {
      loadValueSets('fhir/r4/' + file);
    }
  }
  const result: string[] = [];
  buildValueSetValues(url, result);
  return result;
}

function loadValueSets(fileName: string): void {
  const valueSetBundle = readJson(fileName) as Bundle;
  for (const entry of valueSetBundle.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;
    if (resource.resourceType === 'CodeSystem' || resource.resourceType === 'ValueSet') {
      valueSets.set(resource.url as string, resource as CodeSystem | ValueSet);
    }
  }
}

function buildValueSetValues(url: string, result: string[]): void {
  // If the url includes a version, remove it
  if (url.includes('|')) {
    url = url.split('|')[0];
  }

  const resource = valueSets.get(url);
  if (!resource) {
    return;
  }

  if (resource.resourceType === 'ValueSet') {
    buildValueSetComposeValues(resource.compose, result);
  }

  if (resource.resourceType === 'CodeSystem') {
    buildCodeSystemConceptValues(resource.concept, result);
  }
}

function buildValueSetComposeValues(compose: ValueSetCompose | undefined, result: string[]): void {
  if (compose?.include) {
    for (const include of compose.include) {
      if (include.concept) {
        for (const concept of include.concept) {
          if (concept.code) {
            result.push(concept.code);
          }
        }
      } else if (include.system) {
        const includedValues = getValueSetValues(include.system);
        if (includedValues) {
          result.push(...includedValues);
        }
      }
    }
  }
}

function buildCodeSystemConceptValues(concepts: CodeSystemConcept[] | undefined, result: string[]): void {
  if (!concepts) {
    return;
  }

  for (const concept of concepts) {
    if (concept.code) {
      result.push(concept.code);
    }
    buildCodeSystemConceptValues(concept.concept, result);
  }
}

export async function generateCodeSystems(): Promise<(CodeSystem | ValueSet)[]> {
  const valueSets: (CodeSystem | ValueSet)[] = [];

  valueSets.push(...(await generateCountryCodes()));
  valueSets.push(await generateCurrencyCodes());

  return valueSets;
}

async function generateCountryCodes(): Promise<CodeSystem[]> {
  const m49Codes: Record<string, CodeSystemConcept> = Object.create(null);
  const isoCodes: Record<string, CodeSystemConcept> = Object.create(null);

  const path = resolve(__dirname, 'data/unsd-methodology.csv');
  return new Promise((resolve, reject) => {
    createReadStream(path)
      .pipe(csv({ separator: ';' }))
      .on('data', (row) => parseCountryCodeRow(row, m49Codes, isoCodes))
      .on('end', () =>
        resolve([
          {
            resourceType: 'CodeSystem',
            status: 'active',
            url: 'http://unstats.un.org/unsd/methods/m49/m49.htm',
            content: 'complete',
            concept: Object.values(m49Codes),
            property: [
              {
                code: 'class',
                type: 'code',
                description: 'Size category of region described by the code',
              },
            ],
          },
          {
            resourceType: 'CodeSystem',
            status: 'active',
            url: 'urn:iso:std:iso:3166',
            content: 'complete',
            concept: Object.values(isoCodes),
            property: [
              {
                code: 'synonym',
                type: 'code',
                uri: 'http://hl7.org/fhir/concept-properties#synonym',
                description: 'Equivalent code',
              },
              {
                code: 'numeric',
                type: 'code',
                uri: 'http://hl7.org/fhir/concept-properties#synonym',
                description: 'Equivalent numeric code',
              },
            ],
          },
        ])
      )
      .on('error', reject);
  });
}

function parseCountryCodeRow(
  row: any,
  m49Codes: Record<string, CodeSystemConcept>,
  isoCodes: Record<string, CodeSystemConcept>
): void {
  const world = row['Global Code'] as string;
  const region = row['Region Code'] as string;
  const subRegion = row['Sub-region Code'] as string;
  const intRegion = row['Intermediate Region Code'] as string;
  const country = row['Country or Area'] as string;
  const m49 = row['M49 Code'] as string;
  const iso2 = row['ISO-alpha2 Code'] as string;
  const iso3 = row['ISO-alpha3 Code'] as string;

  if (world) {
    m49Codes[world] = {
      code: world,
      display: row['Global Name'],
      property: [{ code: 'class', valueCode: 'world' }],
    };
  }
  if (region) {
    m49Codes[region] = {
      code: region,
      display: row['Region Name'],
      property: [{ code: 'class', valueCode: 'region' }],
    };
  }
  if (subRegion) {
    m49Codes[subRegion] = {
      code: subRegion,
      display: row['Sub-region Name'],
      property: [{ code: 'class', valueCode: 'sub-region' }],
    };
  }
  if (intRegion) {
    m49Codes[intRegion] = {
      code: intRegion,
      display: row['Intermediate Region Name'],
      property: [{ code: 'class', valueCode: 'intermediate-region' }],
    };
  }
  m49Codes[m49] = { code: m49, display: country, property: [{ code: 'class', valueCode: 'country' }] };
  isoCodes[iso2] = {
    code: iso2,
    display: country,
    property: [
      { code: 'synonym', valueCode: iso3 },
      { code: 'numeric', valueCode: m49 },
    ],
  };
  isoCodes[iso3] = {
    code: iso3,
    display: country,
    property: [
      { code: 'synonym', valueCode: iso2 },
      { code: 'numeric', valueCode: m49 },
    ],
  };
}

async function generateCurrencyCodes(): Promise<CodeSystem> {
  const isoCodes: Record<string, CodeSystemConcept> = Object.create(null);

  const path = resolve(__dirname, 'data/iso-4217-list-one.csv');
  return new Promise((resolve, reject) => {
    createReadStream(path)
      .pipe(csv())
      .on('data', (row) => parseCurrencyCodeRow(row, isoCodes))
      .on('end', () => {
        resolve({
          resourceType: 'CodeSystem',
          status: 'active',
          url: 'urn:iso:std:iso:4217',
          content: 'complete',
          concept: Object.values(isoCodes),
          property: [
            {
              code: 'numeric',
              type: 'code',
              uri: 'http://hl7.org/fhir/concept-properties#synonym',
              description: 'Equivalent numeric code',
            },
          ],
        });
      })
      .on('error', reject);
  });
}

function parseCurrencyCodeRow(row: any, isoCodes: Record<string, CodeSystemConcept>): void {
  const currency = row['Currency'];
  const alpha = row['Alphabetic Code'];
  const num = row['Numeric Code'];

  if (alpha) {
    isoCodes[alpha] = { code: alpha, display: currency, property: [{ code: 'numeric', valueCode: num }] };
  }
}

async function main(): Promise<void> {
  const codeSystems = await generateCodeSystems();

  const bundle: Bundle<CodeSystem | ValueSet> = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: codeSystems.map((resource) => ({ fullUrl: resource.url, resource })),
  };

  const json = JSON.stringify(bundle, undefined, 2)
    .replaceAll("'", '\\u0027')
    .replaceAll('<', '\\u003c')
    .replaceAll('=', '\\u003d')
    .replaceAll('>', '\\u003e');

  writeFileSync(resolve(__dirname, '../../definitions/dist/fhir/r4/valuesets-medplum-generated.json'), json, 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}
