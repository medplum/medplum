// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { getAuthenticatedContext } from '../context';

/**
 * Handles streaming AI responses via Server-Sent Events.
 * This function writes directly to the Express response.
 * @param req - The Express request
 * @param res - The Express response
 */
export async function aiStreamHandler(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const ctx = getAuthenticatedContext();
    if (!ctx.project.features?.includes('ai')) {
      res.status(403).json({ error: 'AI feature not enabled' });
      return;
    }

    // Parse body parameters
    const body = req.body?.parameter;
    if (!body || !Array.isArray(body)) {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }

    const messagesParam = body.find((p: any) => p.name === 'messages');
    const apiKeyParam = body.find((p: any) => p.name === 'apiKey');
    const modelParam = body.find((p: any) => p.name === 'model');
    const toolsParam = body.find((p: any) => p.name === 'tools');

    if (!messagesParam?.valueString || !apiKeyParam?.valueString || !modelParam?.valueString) {
      res.status(400).json({ error: 'Missing required parameters: messages, apiKey, model' });
      return;
    }

    const messages = JSON.parse(messagesParam.valueString);
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages must be an array' });
      return;
    }

    const tools = toolsParam?.valueString ? JSON.parse(toolsParam.valueString) : undefined;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await streamAIToClient(messages, apiKeyParam.valueString, modelParam.valueString, tools, res);
    res.end();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage });
    } else {
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    }
  }
}

/**
 * Streams AI response from OpenAI directly to the client via SSE.
 * This function bridges the OpenAI stream to the Express response without collecting.
 * Note: Tool calls are not supported in streaming mode.
 * @param messages - The conversation messages
 * @param apiKey - OpenAI API key
 * @param model - Model to use
 * @param tools - Optional tools array (ignored in streaming mode)
 * @param res - Express response to write SSE data to
 */
export async function streamAIToClient(
  messages: any[],
  apiKey: string,
  model: string,
  tools: any[] | undefined,
  res: ExpressResponse
): Promise<void> {
  const response = await fetchOpenAI(messages, apiKey, model, tools, true);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText} - ${errorData?.error?.message || 'Unknown error'}`
    );
  }

  if (!response.body) {
    throw new Error('No response body available for streaming');
  }

  // Stream OpenAI response directly to client
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        res.write('data: [DONE]\n\n');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta;

            if (!delta?.content) {
              continue;
            }

            // Forward content chunks to client
            res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
          } catch (e) {
            // Skip malformed JSON
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Makes a request to OpenAI API.
 * @param messages - The conversation messages
 * @param apiKey - OpenAI API key
 * @param model - Model to use
 * @param tools - Optional tools array
 * @param stream - Whether to enable streaming
 * @returns The fetch Response object
 */
async function fetchOpenAI(
  messages: any[],
  apiKey: string,
  model: string,
  tools?: any[],
  stream = false
): Promise<Response> {
  const requestBody: any = {
    model: model,
    messages: messages,
  };

  if (stream) {
    requestBody.stream = true;
    // Don't include tools in streaming mode - tool calls not supported
  } else if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!stream && !response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText} - ${errorData?.error?.message || 'Unknown error'}`
    );
  }

  return response;
}

