// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import express from 'express';
import request from 'supertest';
import { aiRouter } from './routes';
import { callAI } from './server';

jest.mock('./server');

const app = express();
app.use(express.json());
app.use('/ai', aiRouter);

describe('AI Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST / - success with tool calls', async () => {
    const mockResponse = {
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
    };

    (callAI as jest.Mock).mockResolvedValue(mockResponse);

    const res = await request(app)
      .post('/ai')
      .send({
        messages: [{ role: 'user', content: 'Find patient with phone 718-564-9483' }],
        apiKey: 'sk-test-key',
        model: 'gpt-4',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockResponse);
    expect(callAI).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Find patient with phone 718-564-9483' }],
      'sk-test-key',
      'gpt-4'
    );
  });

  test('POST / - success without tool calls', async () => {
    const mockResponse = {
      content: 'I can help you with FHIR queries.',
      tool_calls: [],
    };

    (callAI as jest.Mock).mockResolvedValue(mockResponse);

    const res = await request(app)
      .post('/ai')
      .send({
        messages: [{ role: 'user', content: 'What can you do?' }],
        apiKey: 'sk-test-key',
        model: 'gpt-4',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockResponse);
  });

  test('POST / - missing API key', async () => {
    const res = await request(app)
      .post('/ai')
      .send({
        messages: [{ role: 'user', content: 'Test message' }],
        model: 'gpt-4',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_request',
      error_description: 'API key is required',
    });
    expect(callAI).not.toHaveBeenCalled();
  });

  test('POST / - empty API key', async () => {
    const res = await request(app)
      .post('/ai')
      .send({
        messages: [{ role: 'user', content: 'Test message' }],
        apiKey: '',
        model: 'gpt-4',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_request',
      error_description: 'API key is required',
    });
    expect(callAI).not.toHaveBeenCalled();
  });

  test('POST / - missing model', async () => {
    const res = await request(app)
      .post('/ai')
      .send({
        messages: [{ role: 'user', content: 'Test message' }],
        apiKey: 'sk-test-key',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_request',
      error_description: 'Model is required',
    });
    expect(callAI).not.toHaveBeenCalled();
  });

  test('POST / - empty model', async () => {
    const res = await request(app)
      .post('/ai')
      .send({
        messages: [{ role: 'user', content: 'Test message' }],
        apiKey: 'sk-test-key',
        model: '',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_request',
      error_description: 'Model is required',
    });
    expect(callAI).not.toHaveBeenCalled();
  });

  test('POST / - missing both API key and model', async () => {
    const res = await request(app)
      .post('/ai')
      .send({
        messages: [{ role: 'user', content: 'Test message' }],
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_request',
      error_description: 'API key is required',
    });
    expect(callAI).not.toHaveBeenCalled();
  });

  test('POST / - handles multiple messages', async () => {
    const mockResponse = {
      content: 'Based on our conversation...',
      tool_calls: [],
    };

    (callAI as jest.Mock).mockResolvedValue(mockResponse);

    const messages = [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'First response' },
      { role: 'user', content: 'Follow up question' },
    ];

    const res = await request(app).post('/ai').send({
      messages,
      apiKey: 'sk-test-key',
      model: 'gpt-4',
    });

    expect(res.status).toBe(200);
    expect(callAI).toHaveBeenCalledWith(messages, 'sk-test-key', 'gpt-4');
  });

  test('POST / - handles empty messages array', async () => {
    const mockResponse = {
      content: null,
      tool_calls: [],
    };

    (callAI as jest.Mock).mockResolvedValue(mockResponse);

    const res = await request(app).post('/ai').send({
      messages: [],
      apiKey: 'sk-test-key',
      model: 'gpt-4',
    });

    expect(res.status).toBe(200);
    expect(callAI).toHaveBeenCalledWith([], 'sk-test-key', 'gpt-4');
  });
});
