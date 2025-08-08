// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { EncounterTimeline, ResourceBlame, ResourceTimeline } from '.';

describe('Index', () => {
  test('UI imports', () => {
    expect(EncounterTimeline).toBeDefined();
    expect(ResourceBlame).toBeDefined();
    expect(ResourceTimeline).toBeDefined();
  });
});
