// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from './client';

describe('Index', () => {
  test('MedplumClient import', () => {
    const client = new MedplumClient({
      fetch: jest.fn(),
    });
    expect(client).toBeDefined();
  });
});
