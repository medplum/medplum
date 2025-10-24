// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumProvider, useResource, useSearch } from '.';

describe('Index', () => {
  test('Exports', () => {
    expect(MedplumProvider).toBeDefined();
    expect(useResource).toBeDefined();
    expect(useSearch).toBeDefined();
  });
});
