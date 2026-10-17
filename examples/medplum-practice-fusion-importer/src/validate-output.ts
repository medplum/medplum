// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Validates every resource in the generated batch bundles against the FHIR R4
 * structure definitions using `@medplum/core`'s validateResource — the same validation
 * the Medplum server runs on write.
 */
import {
  indexStructureDefinitionBundle,
  normalizeOperationOutcome,
  operationOutcomeToString,
  validateResource,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { Bundle, Resource } from '@medplum/fhirtypes';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);

const OUT = process.argv.find((a, i) => process.argv[i - 1] === '--output');
if (!OUT) {
  console.error('--output <dir> is required (directory containing the generated *.batch*.json bundles)');
  process.exit(1);
}

let checked = 0;
let failed = 0;
const errorSummary = new Map<string, { count: number; example: string }>();

for (const file of readdirSync(OUT).filter((f) => f.includes('.batch'))) {
  const bundle = JSON.parse(readFileSync(join(OUT, file), 'utf8')) as Bundle;

  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource as Resource;
    checked++;
    try {
      validateResource(resource);
    } catch (err) {
      failed++;
      const msg = operationOutcomeToString(normalizeOperationOutcome(err));
      const key = `${resource.resourceType}: ${msg}`;
      const existing = errorSummary.get(key);
      if (existing) {
        existing.count++;
      } else {
        errorSummary.set(key, { count: 1, example: `${file} ${resource.resourceType}/${resource.id}` });
      }
    }
  }

  try {
    validateResource(bundle);
  } catch (err) {
    console.log(`BUNDLE-LEVEL FAILURE ${file}: ${operationOutcomeToString(normalizeOperationOutcome(err))}`);
  }
}

console.log(`Validated ${checked} resources: ${checked - failed} passed, ${failed} failed`);
for (const [key, info] of [...errorSummary].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`\n${info.count}x ${key}`);
  console.log(`   e.g. ${info.example}`);
}
