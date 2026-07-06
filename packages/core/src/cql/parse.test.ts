// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import type { Bundle } from '@medplum/fhirtypes';
import { readFile } from 'fs/promises';
import { LiteralAtom } from '../fhirpath/atoms';
import { toTypedValue } from '../fhirpath/utils';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { IfAtom } from './atoms';
import { parseCql } from './parse';
import type { CqlLibrary } from './types';

describe('CQL parser', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('Minimal example', () => {
    const input = `
    library HelloWorld version '1.0.0'

    using FHIR version '4.0.1'

    define Greeting:
      'Hello, World!'
    `;

    const expected: CqlLibrary = {
      qualifiedIdentifier: 'HelloWorld',
      versionSpecifier: '1.0.0',
      definitions: [
        {
          qualifiedIdentifier: 'FHIR',
          versionSpecifier: '4.0.1',
        },
      ],
      statements: [
        {
          accessModifier: undefined,
          identifier: 'Greeting',
          expression: new LiteralAtom(toTypedValue('Hello, World!')),
        },
      ],
    };

    expect(parseCql(input)).toStrictEqual(expected);
  });

  test('Interval', () => {
    const input = `
    library FHIRHelpers version '4.0.0'

    using FHIR version '4.0.0'

    define function ToInterval(period FHIR.Period):
        if period is null then
            null
        else
            Interval[period."start".value, period."end".value]
    `;

    const expected: CqlLibrary = {
      qualifiedIdentifier: 'FHIRHelpers',
      versionSpecifier: '4.0.0',
      definitions: [
        {
          qualifiedIdentifier: 'FHIR',
          versionSpecifier: '4.0.0',
        },
      ],
      statements: [
        {
          accessModifier: undefined,
          fluent: false,
          identifier: 'ToInterval',
          operands: [
            {
              referentialIdentifier: 'period',
              typeSpecifier: 'FHIRPeriod',
            },
          ],
          functionBody: expect.any(IfAtom),
        },
      ],
    };

    expect(parseCql(input)).toStrictEqual(expected);
  });

  test.each(['FHIRHelpers-4.0.0'])('Parse %s', async (filename) => {
    const path = `./src/cql/__fixtures__/${filename}.cql`;
    const input = await readFile(path, 'utf8');
    const result = parseCql(input);
    expect(result).toBeDefined();
  });
});
