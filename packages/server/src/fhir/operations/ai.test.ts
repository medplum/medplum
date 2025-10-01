// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { OperationOutcome, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

describe('AI Operation', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Happy path', async () => {
    const mockFetchResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Here are the matching patients',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'fhir_request',
                    arguments: JSON.stringify({
                      method: 'GET',
                      path: 'Patient?phone=718-564-9483',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    };

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify([{ role: 'user', content: 'Find patient with phone 718-564-9483' }]),
          },
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Parameters');
    expect((res.body as Parameters).parameter).toHaveLength(2);
    expect((res.body as Parameters).parameter?.[0]?.name).toBe('content');
    expect((res.body as Parameters).parameter?.[0]?.valueString).toBe('Here are the matching patients');
    expect((res.body as Parameters).parameter?.[1]?.name).toBe('tool_calls');

    const toolCalls = JSON.parse((res.body as Parameters).parameter?.[1]?.valueString as string);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe('call_123');
    expect(toolCalls[0].function.name).toBe('fhir_request');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-test-key',
          'Content-Type': 'application/json',
        },
      })
    );
  });

  test('Happy path - AI creates a patient', async () => {
    const mockFetchResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: 'I will create a new patient for you.',
              tool_calls: [
                {
                  id: 'call_patient_create',
                  type: 'function',
                  function: {
                    name: 'fhir_request',
                    arguments: JSON.stringify({
                      method: 'POST',
                      path: 'Patient',
                      body: {
                        resourceType: 'Patient',
                        name: [
                          {
                            family: 'Smith',
                            given: ['John'],
                          },
                        ],
                        gender: 'male',
                        birthDate: '1990-01-01',
                      },
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    };

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify([
              { role: 'user', content: 'Create a new patient named John Smith, male, born 1990-01-01' },
            ]),
          },
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Parameters');

    const params = res.body as Parameters;
    const contentParam = params.parameter?.find((p) => p.name === 'content');
    const toolCallsParam = params.parameter?.find((p) => p.name === 'tool_calls');

    expect(contentParam).toBeDefined();
    expect(contentParam?.valueString).toBe('I will create a new patient for you.');

    expect(toolCallsParam).toBeDefined();
    const toolCalls = JSON.parse(toolCallsParam?.valueString as string);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe('call_patient_create');
    expect(toolCalls[0].function.name).toBe('fhir_request');

    const functionArgs = JSON.parse(toolCalls[0].function.arguments);
    expect(functionArgs.method).toBe('POST');
    expect(functionArgs.path).toBe('Patient');
    expect(functionArgs.body.resourceType).toBe('Patient');
    expect(functionArgs.body.name[0].family).toBe('Smith');
    expect(functionArgs.body.name[0].given[0]).toBe('John');
    expect(functionArgs.body.gender).toBe('male');
    expect(functionArgs.body.birthDate).toBe('1990-01-01');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-test-key',
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('"model":"gpt-4"'),
      })
    );
  });

  test('Happy path without tool calls', async () => {
    const mockFetchResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: 'I can help you with FHIR queries.',
              tool_calls: null,
            },
          },
        ],
      }),
    };

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify([{ role: 'user', content: 'What can you do?' }]),
          },
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Parameters');
    expect((res.body as Parameters).parameter?.[0]?.valueString).toBe('I can help you with FHIR queries.');
    expect((res.body as Parameters).parameter?.[1]?.valueString).toBe('[]');
  });

  test('Missing API key', async () => {
    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify([{ role: 'user', content: 'Test message' }]),
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toBe(
      'Expected 1 value(s) for input parameter apiKey, but 0 provided'
    );
  });

  test('Missing model', async () => {
    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify([{ role: 'user', content: 'Test message' }]),
          },
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toBe(
      'Expected 1 value(s) for input parameter model, but 0 provided'
    );
  });

  test('Missing messages', async () => {
    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toBe(
      'Expected 1 value(s) for input parameter messages, but 0 provided'
    );
  });

  test('Invalid messages format - not an array', async () => {
    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify({ invalid: 'format' }),
          },
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toBe('Messages must be an array');
  });

  test('Invalid messages JSON', async () => {
    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: 'invalid json',
          },
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.severity).toBe('error');
  });

  test('Unsupported content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('hello');

    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain(
      'Expected at least 1 value(s) for required input parameter'
    );
  });

  test('Incorrect parameters type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
      });

    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain(
      'Expected at least 1 value(s) for required input parameter'
    );
  });

  test('OpenAI API error', async () => {
    const mockFetchResponse = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: jest.fn().mockResolvedValue({
        error: {
          message: 'Incorrect API key provided',
        },
      }),
    };

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify([{ role: 'user', content: 'Test message' }]),
          },
          {
            name: 'apiKey',
            valueString: 'sk-invalid-key',
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain(
      'AI operation failed: OpenAI API error: 401 Unauthorized - Incorrect API key provided'
    );
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain('401');
  });

  test('Handles multiple messages in conversation', async () => {
    const mockFetchResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Based on our conversation...',
              tool_calls: null,
            },
          },
        ],
      }),
    };

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

    const messages = [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'First response' },
      { role: 'user', content: 'Follow up question' },
    ];

    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify(messages),
          },
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    expect(res.status).toBe(200);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const bodyParam = JSON.parse(fetchCall[1].body);
    expect(bodyParam.messages).toEqual(messages);
  });

  test('Handles null content in response', async () => {
    const mockFetchResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_456',
                  type: 'function',
                  function: {
                    name: 'fhir_request',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      }),
    };

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify([{ role: 'user', content: 'Test' }]),
          },
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
          {
            name: 'model',
            valueString: 'gpt-4',
          },
        ],
      });

    console.log(JSON.stringify(res.body, null, 2));
    expect(res.status).toBe(200);
    const params = res.body as Parameters;

    const contentParam = params.parameter?.find((p) => p.name === 'content');
    const toolCallsParam = params.parameter?.find((p) => p.name === 'tool_calls');

    expect(contentParam).toBeUndefined();
    expect(toolCallsParam).toBeDefined();
    expect(toolCallsParam?.valueString).toBeDefined();
  });

  test('Handles different OpenAI models', async () => {
    const mockFetchResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Response from GPT-3.5',
              tool_calls: null,
            },
          },
        ],
      }),
    };

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

    const res = await request(app)
      .post(`/fhir/R4/$ai`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'messages',
            valueString: JSON.stringify([{ role: 'user', content: 'Test message' }]),
          },
          {
            name: 'apiKey',
            valueString: 'sk-test-key',
          },
          {
            name: 'model',
            valueString: 'gpt-3.5-turbo',
          },
        ],
      });

    expect(res.status).toBe(200);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const bodyParam = JSON.parse(fetchCall[1].body);
    expect(bodyParam.model).toBe('gpt-3.5-turbo');
  });
});
