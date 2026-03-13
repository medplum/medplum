// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot, Parameters, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler, SYSTEM_MESSAGE } from './fhir-translator-bot';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = 'application/fhir+json';
const secrets = { OPENAI_API_KEY: { name: 'OPENAI_API_KEY', valueString: 'test-key' } };

function makeInput(messages: object[], model?: string): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'messages', valueString: JSON.stringify(messages) },
      ...(model ? [{ name: 'model', valueString: model }] : []),
    ],
  };
}

describe('fhir-translator-bot', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  test('throws when OPENAI_API_KEY secret is missing', async () => {
    const input = makeInput([{ role: 'user', content: 'Find patient John' }]);
    await expect(handler(medplum, { bot, input, contentType, secrets: {} })).rejects.toThrow(
      'OPENAI_API_KEY is required'
    );
  });

  test('throws when messages parameter is missing', async () => {
    const input: Parameters = { resourceType: 'Parameters', parameter: [] };
    await expect(handler(medplum, { bot, input, contentType, secrets })).rejects.toThrow(
      'messages parameter is required'
    );
  });

  test('returns visualize=false when AI returns no tool calls', async () => {
    const aiResponse: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'content', valueString: 'Some response' }],
    };
    vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    const input = makeInput([{ role: 'user', content: 'Hello' }]);
    const result = await handler(medplum, { bot, input, contentType, secrets });

    expect(result.parameter?.find((p) => p.name === 'visualize')?.valueBoolean).toBe(false);
  });

  test('returns visualize=false when tool call does not set visualize', async () => {
    const toolCalls = [
      { function: { name: 'fhir_request', arguments: JSON.stringify({ method: 'GET', path: 'Patient?name=John' }) } },
    ];
    const aiResponse: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'tool_calls', valueString: JSON.stringify(toolCalls) }],
    };
    vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    const input = makeInput([{ role: 'user', content: 'Find patient John' }]);
    const result = await handler(medplum, { bot, input, contentType, secrets });

    expect(result.parameter?.find((p) => p.name === 'visualize')?.valueBoolean).toBe(false);
  });

  test('returns visualize=true when tool call sets visualize flag', async () => {
    const toolCalls = [
      {
        function: {
          name: 'fhir_request',
          arguments: JSON.stringify({ method: 'GET', path: 'Observation?subject=Patient/123', visualize: true }),
        },
      },
    ];
    const aiResponse: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'tool_calls', valueString: JSON.stringify(toolCalls) }],
    };
    vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    const input = makeInput([{ role: 'user', content: 'Show growth chart' }]);
    const result = await handler(medplum, { bot, input, contentType, secrets });

    expect(result.parameter?.find((p) => p.name === 'visualize')?.valueBoolean).toBe(true);
  });

  test('normalizes tool_calls with object arguments before sending to AI', async () => {
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    const messages = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ function: { name: 'fhir_request', arguments: { method: 'GET', path: 'Patient/123' } } }],
      },
    ];
    const input = makeInput(messages);
    await handler(medplum, { bot, input, contentType, secrets });

    const callArgs = postSpy.mock.calls[0][1] as Parameters;
    const sentMessages = JSON.parse(callArgs.parameter?.find((p) => p.name === 'messages')?.valueString ?? '[]');
    const assistantMsg = sentMessages.find((m: any) => m.role === 'assistant');
    expect(typeof assistantMsg.tool_calls[0].function.arguments).toBe('string');
  });

  test('defaults to gpt-4 model', async () => {
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    await handler(medplum, { bot, input: makeInput([{ role: 'user', content: 'Hello' }]), contentType, secrets });

    const callArgs = postSpy.mock.calls[0][1] as Parameters;
    expect(callArgs.parameter?.find((p) => p.name === 'model')?.valueString).toBe('gpt-4');
  });

  test('uses custom model when specified', async () => {
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    await handler(medplum, {
      bot,
      input: makeInput([{ role: 'user', content: 'Hello' }], 'gpt-4o'),
      contentType,
      secrets,
    });

    const callArgs = postSpy.mock.calls[0][1] as Parameters;
    expect(callArgs.parameter?.find((p) => p.name === 'model')?.valueString).toBe('gpt-4o');
  });

  test('SYSTEM_MESSAGE has role=system', () => {
    expect(SYSTEM_MESSAGE.role).toBe('system');
    expect(SYSTEM_MESSAGE.content).toBeTruthy();
  });

  test('prepends system message to user messages', async () => {
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    const input = makeInput([{ role: 'user', content: 'Find patient' }]);
    await handler(medplum, { bot, input, contentType, secrets });

    const callArgs = postSpy.mock.calls[0][1] as Parameters;
    const sentMessages = JSON.parse(callArgs.parameter?.find((p) => p.name === 'messages')?.valueString ?? '[]');
    expect(sentMessages[0].role).toBe('system');
    expect(sentMessages[1].role).toBe('user');
  });
});
