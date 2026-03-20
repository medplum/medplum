// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { getReferenceString, isNotFound, OperationOutcomeError } from '@medplum/core';
import type { Bundle, Communication, Identifier, Resource, ResourceType } from '@medplum/fhirtypes';
import type { useMedplum } from '@medplum/react';
import type { Message } from '../types/spaces';
import { createConversationTopic, saveMessage } from './spacePersistence';

const fhirRequestToolsId: Identifier = {
  value: 'ai-fhir-request-tools',
  system: 'https://www.medplum.com/bots',
};

const resourceSummaryBotId: Identifier = {
  value: 'ai-resource-summary',
  system: 'https://www.medplum.com/bots',
};

const resourceSummaryBotSseId: Identifier = {
  value: 'ai-resource-summary-sse',
  system: 'https://www.medplum.com/bots',
};

const componentGeneratorBotSseId: Identifier = {
  value: 'ai-component-generator-sse',
  system: 'https://www.medplum.com/bots',
};

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string | Record<string, unknown>;
  };
}

interface FhirRequestArgs {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
}

export interface ExecuteToolCallsResult {
  messages: Message[];
  resourceRefs: string[];
}

async function executeFhirRequest(medplum: ReturnType<typeof useMedplum>, args: FhirRequestArgs): Promise<Resource> {
  const { method, path, body } = args;
  switch (method) {
    case 'GET':
      return medplum.get(medplum.fhirUrl(path));
    case 'POST':
      return medplum.post(medplum.fhirUrl(path), body);
    case 'PUT':
      return medplum.put(medplum.fhirUrl(path), body);
    case 'DELETE':
      return medplum.delete(medplum.fhirUrl(path));
    default:
      throw new Error(`Unsupported HTTP method: ${method}`);
  }
}

function extractResourceRefs(result: Resource | Bundle): string[] {
  const refs: string[] = [];
  if (result.resourceType === 'Bundle' && result.entry) {
    for (const entry of result.entry) {
      if (entry.resource) {
        const ref = getReferenceString(entry.resource);
        if (ref) {
          refs.push(ref);
        }
      }
    }
  } else {
    const ref = getReferenceString(result);
    if (ref) {
      refs.push(ref);
    }
  }
  return refs;
}

export class StreamingCodeExtractor {
  private buffer = '';
  private code = '';
  private inCodeBlock = false;

  process(chunk: string): void {
    this.buffer += chunk;

    while (true) {
      if (!this.inCodeBlock) {
        const startMatch = this.buffer.match(/```(?:jsx|tsx|javascript|js)?\s*\n/);
        if (startMatch?.index !== undefined) {
          this.inCodeBlock = true;
          this.buffer = this.buffer.slice(startMatch.index + startMatch[0].length);
        } else {
          break;
        }
      }

      if (this.inCodeBlock) {
        const endIndex = this.buffer.indexOf('```');
        if (endIndex !== -1) {
          this.code += this.buffer.slice(0, endIndex);
          this.buffer = this.buffer.slice(endIndex + 3);
          this.inCodeBlock = false;
        } else {
          // Keep last 3 chars in buffer in case ``` spans chunks
          const safeLength = Math.max(0, this.buffer.length - 3);
          this.code += this.buffer.slice(0, safeLength);
          this.buffer = this.buffer.slice(safeLength);
          break;
        }
      }
    }
  }

  getCode(): string | undefined {
    const trimmed = this.code.trim();
    return trimmed || undefined;
  }
}

export async function collectFhirData(medplum: MedplumClient, refs: string[]): Promise<Resource[]> {
  const results = await Promise.all(
    refs.map(async (ref) => {
      try {
        const [resourceType, id] = ref.split('/');
        return await medplum.readResource(resourceType as ResourceType, id);
      } catch (error) {
        if (!(error instanceof OperationOutcomeError && isNotFound(error.outcome))) {
          console.error(`Failed to fetch ${ref}:`, error);
        }
        return undefined;
      }
    })
  );
  return results.filter((resource) => resource !== undefined);
}

export async function executeToolCalls(
  medplum: ReturnType<typeof useMedplum>,
  toolCalls: ToolCall[],
  onFhirRequest: (request: string) => void
): Promise<ExecuteToolCallsResult> {
  const messages: Message[] = [];
  const resourceRefs: string[] = [];

  for (const toolCall of toolCalls) {
    if (toolCall.function.name === 'fhir_request') {
      const args =
        typeof toolCall.function.arguments === 'string'
          ? (JSON.parse(toolCall.function.arguments) as FhirRequestArgs)
          : (toolCall.function.arguments as unknown as FhirRequestArgs);

      onFhirRequest(`${args.method} ${args.path}`);

      try {
        const result = await executeFhirRequest(medplum, args);
        resourceRefs.push(...extractResourceRefs(result));

        const toolMessage: Message = {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        };
        messages.push(toolMessage);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        const toolErrorMessage: Message = {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: true,
            message: `Unable to execute ${args.method}: ${args.path}`,
            details: errorMessage,
          }),
        };
        messages.push(toolErrorMessage);
      }
    } else if (toolCall.function.name === 'set_visualization') {
      // Acknowledge visualization tool call (handled separately via visualize flag)
      const toolMessage: Message = {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({ acknowledged: true }),
      };
      messages.push(toolMessage);
    } else {
      // Handle unrecognized tool calls - OpenAI requires a response for every tool_call_id
      const toolErrorMessage: Message = {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          error: true,
          message: `Unrecognized tool: ${toolCall.function.name}`,
        }),
      };
      messages.push(toolErrorMessage);
    }
  }

  return { messages, resourceRefs };
}

/**
 * Strip display-only fields that should not be sent to the AI API
 * @param messages - The messages to strip
 * @returns Messages with only API-relevant fields
 */
function toApiMessages(messages: Message[]): Pick<Message, 'role' | 'content' | 'tool_calls' | 'tool_call_id'>[] {
  return messages.map(({ role, content, tool_calls, tool_call_id }) => ({
    role,
    content,
    ...(tool_calls !== undefined && { tool_calls }),
    ...(tool_call_id !== undefined && { tool_call_id }),
  }));
}

export async function sendToBot(
  medplum: ReturnType<typeof useMedplum>,
  botId: Identifier,
  messages: Message[],
  model: string
): Promise<{ content?: string; toolCalls?: ToolCall[]; visualize?: boolean }> {
  const response = await medplum.executeBot(botId, {
    resourceType: 'Parameters',
    parameter: [
      { name: 'messages', valueString: JSON.stringify(toApiMessages(messages)) },
      { name: 'model', valueString: model },
    ],
  });

  const content = response.parameter?.find((p: { name: string }) => p.name === 'content')?.valueString;
  const toolCallsStr = response.parameter?.find((p: { name: string }) => p.name === 'tool_calls')?.valueString;
  const toolCalls = toolCallsStr ? JSON.parse(toolCallsStr) : undefined;
  const visualize = response.parameter?.find((p: { name: string }) => p.name === 'visualize')?.valueBoolean;

  return { content, toolCalls, visualize };
}

export interface StreamingResult {
  content: string;
  code?: string;
}

export async function sendToBotStreaming(
  medplum: ReturnType<typeof useMedplum>,
  botId: Identifier,
  messages: Message[],
  model: string,
  onChunk: (chunk: string) => void,
  additionalParams?: { name: string; valueString: string }[]
): Promise<StreamingResult> {
  const baseUrl = medplum.fhirUrl('Bot', '$execute').toString();
  const url = `${baseUrl}?identifier=${encodeURIComponent(`${botId.system}|${botId.value}`)}`;
  const codeExtractor = new StreamingCodeExtractor();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${medplum.getAccessToken()}`,
      'Content-Type': 'application/fhir+json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      resourceType: 'Parameters',
      parameter: [
        { name: 'messages', valueString: JSON.stringify(toApiMessages(messages)) },
        { name: 'model', valueString: model },
        ...(additionalParams || []),
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bot execution failed: ${response.status} - ${errorText}`);
  }

  const contentType = response.headers.get('Content-Type') || '';
  const isStreaming = contentType.includes('text/event-stream');

  // Handle non-streaming (buffered) JSON response
  if (!isStreaming) {
    const data = await response.json();
    const content = data.parameter?.find((p: { name: string }) => p.name === 'content')?.valueString || '';
    if (content) {
      onChunk(content);
      codeExtractor.process(content);
    }
    return { content, code: codeExtractor.getCode() };
  }

  // Handle streaming SSE response
  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (!data || data === '[DONE]') {
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.content || parsed.choices?.[0]?.delta?.content;
          if (chunk) {
            fullContent += chunk;
            codeExtractor.process(chunk);
            onChunk(chunk);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  return { content: fullContent, code: codeExtractor.getCode() };
}

export interface ProcessMessageParams {
  medplum: ReturnType<typeof useMedplum>;
  input: string;
  userMessage: Message;
  currentMessages: Message[];
  currentTopicId: string | undefined;
  selectedModel: string;
  isFirstMessage: boolean;
  setCurrentTopicId: (id: string | undefined) => void;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  setCurrentFhirRequest: (request: string | undefined) => void;
  onNewTopic: (topic: Communication) => void;
  onStreamChunk?: (chunk: string) => void;
  onComponentStreamChunk?: (chunk: string) => void;
}

export interface ProcessMessageResult {
  activeTopicId: string | undefined;
  assistantMessage: Message;
  updatedMessages: Message[];
}

export async function processMessage(params: ProcessMessageParams): Promise<ProcessMessageResult> {
  const {
    medplum,
    input,
    userMessage,
    currentMessages,
    currentTopicId,
    selectedModel,
    isFirstMessage,
    setCurrentTopicId,
    setRefreshKey,
    setCurrentFhirRequest,
    onNewTopic,
    onStreamChunk,
    onComponentStreamChunk,
  } = params;

  // Create topic on first message
  let activeTopicId = currentTopicId;
  if (isFirstMessage) {
    const newTopic = await createConversationTopic(medplum, input.substring(0, 100), selectedModel);
    activeTopicId = newTopic.id;
    setCurrentTopicId(activeTopicId);
    setRefreshKey((prev) => prev + 1);
    onNewTopic(newTopic);
  }

  // Save user message
  if (activeTopicId) {
    await saveMessage(medplum, activeTopicId, userMessage, currentMessages.length - 1);
  }

  const MAX_AGENT_ITERATIONS = 10;
  const allResourceRefs: string[] = [];
  let visualize = false;
  let content: string | undefined;
  let loopCompleted = false;

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    const translatorResponse = await sendToBot(medplum, fhirRequestToolsId, currentMessages, selectedModel);

    // No tool calls = bot is done, has final answer
    if (!translatorResponse.toolCalls || translatorResponse.toolCalls.length === 0) {
      content = translatorResponse.content;
      loopCompleted = true;
      break;
    }

    if (translatorResponse.visualize) {
      visualize = true;
    }

    const assistantMessageWithToolCalls: Message = {
      role: 'assistant',
      content: null,
      tool_calls: translatorResponse.toolCalls,
    };
    currentMessages.push(assistantMessageWithToolCalls);

    const { messages: toolMessages, resourceRefs } = await executeToolCalls(
      medplum,
      translatorResponse.toolCalls,
      (request) => setCurrentFhirRequest(`Step ${iteration + 1}: ${request}`)
    );
    currentMessages.push(...toolMessages);
    allResourceRefs.push(...resourceRefs);

    // Persist per-iteration (keeps DB recoverable if mid-loop failure)
    if (activeTopicId) {
      const baseSequence = currentMessages.length - 1 - toolMessages.length;
      for (let i = 0; i < toolMessages.length; i++) {
        await saveMessage(medplum, activeTopicId, toolMessages[i], baseSequence + 1 + i);
      }
      await saveMessage(medplum, activeTopicId, assistantMessageWithToolCalls, baseSequence);
    }

    // Reset FHIR indicator while bot thinks about next step
    setCurrentFhirRequest(undefined);
  }

  if (!loopCompleted) {
    throw new Error(
      `The AI reached the maximum number of steps (${MAX_AGENT_ITERATIONS}) without completing your request. Please try a more specific question.`
    );
  }

  // Get summary response after tool execution (streaming if callback provided)
  if (currentMessages.some((m) => m.role === 'tool')) {
    if (onStreamChunk) {
      const result = await sendToBotStreaming(
        medplum,
        resourceSummaryBotSseId,
        currentMessages,
        selectedModel,
        onStreamChunk
      );
      content = result.content;
    } else {
      const summaryResponse = await sendToBot(medplum, resourceSummaryBotId, currentMessages, selectedModel);
      content = summaryResponse.content;
    }
  }

  let componentCode: string | undefined;
  if (visualize && allResourceRefs.length > 0) {
    const fhirData = await collectFhirData(medplum, allResourceRefs);

    const componentChunkCallback = onComponentStreamChunk ?? onStreamChunk;
    if (componentChunkCallback) {
      const result = await sendToBotStreaming(
        medplum,
        componentGeneratorBotSseId,
        currentMessages,
        selectedModel,
        componentChunkCallback,
        [{ name: 'fhirData', valueString: JSON.stringify(fhirData) }]
      );
      componentCode = result.code;
    } else {
      await sendToBot(medplum, componentGeneratorBotSseId, currentMessages, selectedModel);
    }
  }

  const uniqueRefs = allResourceRefs.length > 0 ? [...new Set(allResourceRefs)] : undefined;
  const assistantMessage: Message = {
    role: 'assistant',
    content: content || 'I received your message but was unable to generate a response. Please try again.',
    resources: uniqueRefs,
    componentCode,
  };

  if (activeTopicId) {
    await saveMessage(medplum, activeTopicId, assistantMessage, currentMessages.length);
  }

  return {
    activeTopicId,
    assistantMessage,
    updatedMessages: [...currentMessages, assistantMessage],
  };
}
