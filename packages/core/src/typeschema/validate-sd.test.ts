// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import { Bundle, Observation, StructureDefinition } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { indexStructureDefinitionBundle } from './types';
import { validateResource } from './validation';

// This is a separate file so that we can index SDs without any pre-existing SDs being loaded
// There may be a better way to do this

test('Validate StructureDefinition with contentReference missing base', () => {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);

  const observationSd = JSON.parse(
    readFileSync(resolve(__dirname, '__test__', 'compressed-observation.json'), 'utf8')
  ) as StructureDefinition;
  const observationDefinitionSd = JSON.parse(
    readFileSync(resolve(__dirname, '__test__', 'compressed-observation-def.json'), 'utf8')
  ) as StructureDefinition;
  indexStructureDefinitionBundle([observationSd, observationDefinitionSd]);

  const issues = validateResource({
    resourceType: 'Observation',
    component: [{ referenceRange: [{ low: { value: 5 }, high: { value: 10 } }], code: { text: 'A test' } }],
    status: 'final',
    code: { text: 'A test' },
  } satisfies Observation);

  expect(issues.length).toStrictEqual(0);
});
