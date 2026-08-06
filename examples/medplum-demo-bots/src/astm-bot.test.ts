// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bot, Bundle, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './astm-bot';

//To run these tests from the command line
//npm t src/astm-bot.test.ts

describe('ASTM Bots', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  const bot: Reference<Bot> = { reference: 'Bot/123' };

  // Exactly what mode=astm delivers: record text, framing already stripped.
  const input = ['H|\\^&|||BioRad^1.0|||||||P|1', 'P|1||PID123', 'R|1|^^^GLU|95|mg/dL|', 'L|1|N'].join('\n') + '\n';

  test('Creates an Observation per result record', async () => {
    const medplum = new MockClient();

    const observations = await handler(medplum, {
      bot,
      input,
      contentType: ContentType.ASTM_E1394,
      secrets: {},
    });

    expect(observations).toHaveLength(1);
    expect(observations[0].code?.text).toBe('GLU');
    expect(observations[0].valueQuantity).toMatchObject({ value: 95, unit: 'mg/dL' });
  });

  test('Skips a result record with no parseable value', async () => {
    const medplum = new MockClient();

    const observations = await handler(medplum, {
      bot,
      input: 'H|\\^&|||BioRad\nR|1|^^^GLU|PENDING||\nL|1|N\n',
      contentType: ContentType.ASTM_E1394,
      secrets: {},
    });

    expect(observations).toEqual([]);
  });
});
