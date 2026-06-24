// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { closeAgentCallbackSubscriber, registerAgentCallback } from './agentcallback';

describe('agentcallback', () => {
  beforeEach(() => {
    closeAgentCallbackSubscriber();
  });

  afterAll(() => {
    closeAgentCallbackSubscriber();
  });

  test('registerAgentCallback throws when subscriber not yet initialized', async () => {
    await expect(registerAgentCallback('agent:cb:host:abc', 1000)).rejects.toThrow(
      'Callback subscriber not yet initialized'
    );
  });
});
