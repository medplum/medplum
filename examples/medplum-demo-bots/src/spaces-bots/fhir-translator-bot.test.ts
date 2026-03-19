// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot, Parameters, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './fhir-translator-bot';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = 'application/fhir+json';
const secrets = { OPENAI_API_KEY: { name: 'OPENAI_API_KEY', valueString: 'test-key' } };

const SYSTEM_PROMPT = 'You are a FHIR Request Translator.';
const PROFILE_CONTEXT_TEMPLATE = '## CURRENT USER CONTEXT:\nRef: {{ref}}';

function makeInput(messages: object[], model?: string): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'messages', valueString: JSON.stringify(messages) },
      ...(model ? [{ name: 'model', valueString: model }] : []),
    ],
  };
}

function mockSystemPromptCommunication(medplum: MockClient, payload1?: string): void {
  vi.spyOn(medplum, 'searchOne').mockResolvedValueOnce({
    resourceType: 'Communication',
    id: 'test-communication',
    status: 'completed',
    payload: [{ contentString: SYSTEM_PROMPT }, ...(payload1 !== undefined ? [{ contentString: payload1 }] : [])],
  });
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
    mockSystemPromptCommunication(medplum, PROFILE_CONTEXT_TEMPLATE);
    const input: Parameters = { resourceType: 'Parameters', parameter: [] };
    await expect(handler(medplum, { bot, input, contentType, secrets })).rejects.toThrow(
      'messages parameter is required'
    );
  });

  test('throws when system prompt Communication is missing', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValueOnce(undefined);
    const input = makeInput([{ role: 'user', content: 'Hello' }]);
    await expect(handler(medplum, { bot, input, contentType, secrets })).rejects.toThrow(
      'ai-fhir-request-tools system prompt is not available'
    );
  });

  test('throws when profile context template (payload[1]) is missing', async () => {
    mockSystemPromptCommunication(medplum); // no payload[1]
    const input = makeInput([{ role: 'user', content: 'Hello' }]);
    await expect(handler(medplum, { bot, input, contentType, secrets })).rejects.toThrow(
      'ai-fhir-request-tools profile context template is not available'
    );
  });

  test('returns visualize=false when AI returns no tool calls', async () => {
    mockSystemPromptCommunication(medplum, PROFILE_CONTEXT_TEMPLATE);
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
    mockSystemPromptCommunication(medplum, PROFILE_CONTEXT_TEMPLATE);
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
    mockSystemPromptCommunication(medplum, PROFILE_CONTEXT_TEMPLATE);
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
    mockSystemPromptCommunication(medplum, PROFILE_CONTEXT_TEMPLATE);
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
    mockSystemPromptCommunication(medplum, PROFILE_CONTEXT_TEMPLATE);
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    await handler(medplum, { bot, input: makeInput([{ role: 'user', content: 'Hello' }]), contentType, secrets });

    const callArgs = postSpy.mock.calls[0][1] as Parameters;
    expect(callArgs.parameter?.find((p) => p.name === 'model')?.valueString).toBe('gpt-4');
  });

  test('uses custom model when specified', async () => {
    mockSystemPromptCommunication(medplum, PROFILE_CONTEXT_TEMPLATE);
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

  test('prepends system message to user messages', async () => {
    mockSystemPromptCommunication(medplum, PROFILE_CONTEXT_TEMPLATE);
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    const input = makeInput([{ role: 'user', content: 'Find patient' }]);
    await handler(medplum, { bot, input, contentType, secrets });

    const callArgs = postSpy.mock.calls[0][1] as Parameters;
    const sentMessages = JSON.parse(callArgs.parameter?.find((p) => p.name === 'messages')?.valueString ?? '[]');
    expect(sentMessages[0].role).toBe('system');
    expect(sentMessages[0].content).toContain(SYSTEM_PROMPT);
    expect(sentMessages[1].role).toBe('user');
  });

  test('appends profile context with replaced ref when requester is provided', async () => {
    mockSystemPromptCommunication(medplum, PROFILE_CONTEXT_TEMPLATE);
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    const input = makeInput([{ role: 'user', content: 'Who am I?' }]);
    await handler(medplum, {
      bot,
      input,
      contentType,
      secrets,
      requester: { reference: 'Practitioner/abc' },
    });

    const callArgs = postSpy.mock.calls[0][1] as Parameters;
    const sentMessages = JSON.parse(callArgs.parameter?.find((p) => p.name === 'messages')?.valueString ?? '[]');
    expect(sentMessages[0].content).toContain('Practitioner/abc');
    expect(sentMessages[0].content).not.toContain('{{ref}}');
  });
});
