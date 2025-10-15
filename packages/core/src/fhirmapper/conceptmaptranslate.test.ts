// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ConceptMap } from '@medplum/fhirtypes';
import type { ConceptMapTranslateMatch, ConceptMapTranslateParameters } from './conceptmaptranslate';
import { conceptMapTranslate } from './conceptmaptranslate';

const system = 'http://example.com/private-codes';
const code = 'FSH';
const conceptMap: ConceptMap = {
  resourceType: 'ConceptMap',
  url: 'http://example.com/concept-map',
  status: 'active',
  sourceCanonical: 'http://example.com/labs',
  group: [
    {
      source: system,
      target: 'http://loinc.org',
      element: [
        {
          code,
          target: [
            {
              code: '15067-2',
              display: 'Follitropin Qn',
              equivalence: 'equivalent',
            },
          ],
        },
      ],
    },
    {
      source: system,
      target: 'http://www.ama-assn.org/go/cpt',
      element: [
        {
          code,
          target: [{ code: '83001', equivalence: 'equivalent' }],
        },
      ],
    },
  ],
};

describe('ConceptMap $translate', () => {
  test.each<[string, ConceptMapTranslateParameters]>([
    ['with system and code', { system, code }],
    ['with coding', { coding: { system, code } }],
    ['with CodeableConcept', { codeableConcept: { coding: [{ system, code }] } }],
  ])('Success %s', async (_format, params) => {
    const output = conceptMapTranslate(conceptMap, params);
    expect(output.result).toStrictEqual(true);

    const matches = output.match;
    expect(matches).toHaveLength(2);
    expect(matches?.[0]).toMatchObject<ConceptMapTranslateMatch>({
      equivalence: 'equivalent',
      concept: {
        system: 'http://loinc.org',
        code: '15067-2',
        display: 'Follitropin Qn',
      },
    });
    expect(matches?.[1]).toMatchObject<ConceptMapTranslateMatch>({
      equivalence: 'equivalent',
      concept: {
        system: 'http://www.ama-assn.org/go/cpt',
        code: '83001',
      },
    });
  });

  test('Filter on target system', async () => {
    const output = conceptMapTranslate(conceptMap, {
      url: conceptMap.url,
      targetsystem: 'http://loinc.org',
      coding: { system, code },
    });
    expect(output.result).toStrictEqual(true);

    const matches = output.match;
    expect(matches).toHaveLength(1);
    expect(matches?.[0]).toMatchObject<ConceptMapTranslateMatch>({
      equivalence: 'equivalent',
      concept: {
        system: 'http://loinc.org',
        code: '15067-2',
        display: 'Follitropin Qn',
      },
    });
  });

  test('No match', async () => {
    const output = conceptMapTranslate(conceptMap, { coding: { system, code: 'BAD' } });
    expect(output.result).toStrictEqual(false);
  });

  test('Code without system', async () => {
    expect(() => conceptMapTranslate(conceptMap, { code: 'BAD' })).toThrow(
      'System parameter must be provided with code'
    );
  });

  test('Ambiguous coding provided', async () => {
    expect(() => conceptMapTranslate(conceptMap, { coding: { system, code }, system, code: 'BAD' })).toThrow(
      `Ambiguous input: multiple source codings provided`
    );
  });

  test('No source coding', async () => {
    expect(() => conceptMapTranslate(conceptMap, {})).toThrow(`Source Coding (system + code) must be specified`);
  });

  test('Unmapped code handling', async () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      url: 'http://example.com/concept-map',
      status: 'active',
      sourceCanonical: 'http://example.com/labs',
      group: [
        {
          source: system,
          target: system + '/v2',
          element: [
            {
              code: 'OTHER',
              target: [{ code: 'DISTINCT', equivalence: 'equivalent' }],
            },
          ],
          unmapped: {
            mode: 'provided',
          },
        },
        {
          source: system,
          target: 'http://example.com/other-system',
          element: [
            {
              code: 'OTHER',
              target: [{ code: '1', equivalence: 'equivalent' }],
            },
          ],
          unmapped: {
            mode: 'fixed',
            code: 'UNK',
            display: 'Unknown',
          },
        },
      ],
    };

    const output = conceptMapTranslate(conceptMap, { coding: { system, code } });
    expect(output.result).toStrictEqual(true);

    const matches = output.match;
    expect(matches).toHaveLength(2);
    expect(matches?.[0]).toMatchObject<ConceptMapTranslateMatch>({
      equivalence: 'equal',
      concept: { system: system + '/v2', code },
    });
    expect(matches?.[1]).toMatchObject<ConceptMapTranslateMatch>({
      equivalence: 'equivalent',
      concept: {
        system: 'http://example.com/other-system',
        code: 'UNK',
        display: 'Unknown',
      },
    });
  });

  test('Handles empty CodeableConcept', async () => {
    const output = conceptMapTranslate(conceptMap, { codeableConcept: { text: 'Nebulous concept' } });
    expect(output.result).toStrictEqual(false);
  });

  test('Handles implicit system', async () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      url: 'http://example.com/concept-map',
      status: 'active',
      sourceCanonical: 'http://example.com/labs',
      group: [
        {
          target: 'http://loinc.org',
          element: [
            {
              code,
              target: [
                {
                  code: '15067-2',
                  display: 'Follitropin Qn',
                  equivalence: 'equivalent',
                },
              ],
            },
          ],
        },
      ],
    };

    const output = conceptMapTranslate(conceptMap, { codeableConcept: { coding: [{ code }] } });
    expect(output.result).toStrictEqual(true);

    const matches = output.match;
    expect(matches).toHaveLength(1);
    expect(matches?.[0]).toMatchObject<ConceptMapTranslateMatch>({
      equivalence: 'equivalent',
      concept: {
        system: 'http://loinc.org',
        code: '15067-2',
        display: 'Follitropin Qn',
      },
    });
  });

  test('No mapping groups specified', async () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      url: 'http://example.com/concept-map',
      status: 'active',
      sourceCanonical: 'http://example.com/labs',
      targetCanonical: 'http://example.com/loinc',
    };

    expect(() => conceptMapTranslate(conceptMap, {})).toThrow('ConceptMap does not specify a mapping group');
  });
});
