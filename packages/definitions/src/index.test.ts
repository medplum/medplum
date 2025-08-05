// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '.';

describe('Definitions', () => {
  test('Read FHIR schema JSON', () => {
    const result = readJson('../dist/fhir/r4/fhir.schema.json');
    expect(result).not.toBeNull();
  });
});
