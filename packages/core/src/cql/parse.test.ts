// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import type { Bundle } from '@medplum/fhirtypes';
import { LiteralAtom } from '../fhirpath/atoms';
import { toTypedValue } from '../fhirpath/utils';
import { indexStructureDefinitionBundle } from '../typeschema/types';
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
});
