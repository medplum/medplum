// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { tokenize } from './tokenize';

describe('CQL Tokenizer', () => {
  test('Hello world', () => {
    const example = `
    library HelloWorld version '1.0.0'

    using FHIR version '4.0.1'

    define Greeting:
      'Hello, World!'
    `;

    const tokens = tokenize(example);
    expect(tokens.length).toBe(12);
    expect(tokens.map((t) => t.value)).toEqual([
      'library',
      'HelloWorld',
      'version',
      '1.0.0',
      'using',
      'FHIR',
      'version',
      '4.0.1',
      'define',
      'Greeting',
      ':',
      'Hello, World!',
    ]);
  });

  test('Standalone directive', () => {
    const example = `
    #AllowFluent

    library Example version '1.0.0'

    using FHIR version '4.0.1'
    `;

    const tokens = tokenize(example);
    expect(tokens.length).toBe(10);
    expect(tokens.map((t) => t.value)).toEqual([
      '#',
      'AllowFluent',
      'library',
      'Example',
      'version',
      '1.0.0',
      'using',
      'FHIR',
      'version',
      '4.0.1',
    ]);
  });

  test('Definition directive', () => {
    const example = `
    #DefaultComparisonPrecision: minutes

    library Example version '1.0.0'
    `;

    const tokens = tokenize(example);
    expect(tokens.length).toBe(8);
    expect(tokens.map((t) => t.value)).toEqual([
      '#',
      'DefaultComparisonPrecision',
      ':',
      'minutes',
      'library',
      'Example',
      'version',
      '1.0.0',
    ]);
  });
});
