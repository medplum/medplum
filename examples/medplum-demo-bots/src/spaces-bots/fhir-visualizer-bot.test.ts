// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot, Parameters, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './fhir-visualizer-bot';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = 'application/fhir+json';
const secrets = { OPENAI_API_KEY: { name: 'OPENAI_API_KEY', valueString: 'test-key' } };

function makeInput(messages: object[], fhirData?: object[], model?: string): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'messages', valueString: JSON.stringify(messages) },
      ...(fhirData ? [{ name: 'fhirData', valueString: JSON.stringify(fhirData) }] : []),
      ...(model ? [{ name: 'model', valueString: model }] : []),
    ],
  };
}

describe('fhir-visualizer-bot', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.spyOn(medplum, 'searchOne').mockResolvedValue({
      resourceType: 'Communication',
      payload: [{ contentString: 'You are a helpful FHIR visualization assistant.' }],
      status: 'completed',
      id: 'test-communication',
    });
  });

  test('returns OperationOutcome when OPENAI_API_KEY is missing', async () => {
    const input = makeInput([{ role: 'user', content: 'Show chart' }]);
    const result = await handler(medplum, { bot, input, contentType, secrets: {} });
    expect(result).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', details: { text: expect.stringContaining('OPENAI_API_KEY') } }],
    });
  });

  test('returns OperationOutcome when messages parameter is missing', async () => {
    const input: Parameters = { resourceType: 'Parameters', parameter: [] };
    const result = await handler(medplum, { bot, input, contentType, secrets });
    expect(result).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', details: { text: 'messages parameter is required' } }],
    });
  });

  test('returns AI response for non-streaming request', async () => {
    const aiResponse: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'content', valueString: '```jsx\nfunction Chart() { return <div/>; }\n```' }],
    };
    vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    const fhirData = [{ resourceType: 'Observation', valueQuantity: { value: 120 } }];
    const input = makeInput([{ role: 'user', content: 'Show vitals chart' }], fhirData);
    const result = await handler(medplum, { bot, input, contentType, secrets });

    expect(result).toEqual(aiResponse);
  });

  test('appends fhir data message to conversation before sending to AI', async () => {
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    const fhirData = [{ resourceType: 'Observation', id: 'obs-1' }];
    const input = makeInput([{ role: 'user', content: 'Visualize' }], fhirData);
    await handler(medplum, { bot, input, contentType, secrets });

    const callArgs = postSpy.mock.calls[0][1] as Parameters;
    const sentMessages = JSON.parse(callArgs.parameter?.find((p) => p.name === 'messages')?.valueString ?? '[]');
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toContain('obs-1');
  });

  test('handles missing fhirData gracefully', async () => {
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    const input = makeInput([{ role: 'user', content: 'Show chart' }]);
    const result = await handler(medplum, { bot, input, contentType, secrets });

    expect(result).toBeDefined();
  });

  test('defaults to gpt-4o model', async () => {
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    await handler(medplum, { bot, input: makeInput([{ role: 'user', content: 'Hello' }]), contentType, secrets });

    const callArgs = postSpy.mock.calls[0][1] as Parameters;
    expect(callArgs.parameter?.find((p) => p.name === 'model')?.valueString).toBe('gpt-4o');
  });

  test('uses custom model when specified', async () => {
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    await handler(medplum, {
      bot,
      input: makeInput([{ role: 'user', content: 'Hello' }], undefined, 'gpt-4'),
      contentType,
      secrets,
    });

    const callArgs = postSpy.mock.calls[0][1] as Parameters;
    expect(callArgs.parameter?.find((p) => p.name === 'model')?.valueString).toBe('gpt-4');
  });

  test('normalizes tool_calls with object arguments before sending to AI', async () => {
    const aiResponse: Parameters = { resourceType: 'Parameters', parameter: [] };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(aiResponse);

    const messages = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { function: { name: 'fhir_request', arguments: { method: 'GET', path: 'Observation?subject=Patient/123' } } },
        ],
      },
    ];
    await handler(medplum, { bot, input: makeInput(messages), contentType, secrets });

    const callArgs = postSpy.mock.calls[0][1] as Parameters;
    const sentMessages = JSON.parse(callArgs.parameter?.find((p) => p.name === 'messages')?.valueString ?? '[]');
    const assistantMsg = sentMessages.find((m: any) => m.role === 'assistant');
    expect(typeof assistantMsg.tool_calls[0].function.arguments).toBe('string');
  });
});
