// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { useMedplum } from '@medplum/react';
import type { Identifier, Communication, Resource, Bundle } from '@medplum/fhirtypes';
import { getReferenceString } from '@medplum/core';
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

export async function executeToolCalls(
  medplum: ReturnType<typeof useMedplum>,
  toolCalls: ToolCall[],
  activeTopicId: string | undefined,
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

        if (activeTopicId) {
          await saveMessage(medplum, activeTopicId, toolMessage, messages.length - 1);
        }
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

        if (activeTopicId) {
          await saveMessage(medplum, activeTopicId, toolErrorMessage, messages.length - 1);
        }
      }
    }
  }

  return { messages, resourceRefs };
}

export async function sendToBot(
  medplum: ReturnType<typeof useMedplum>,
  botId: Identifier,
  messages: Message[],
  model: string
): Promise<{ content?: string; toolCalls?: ToolCall[] }> {
  const response = await medplum.executeBot(botId, {
    resourceType: 'Parameters',
    parameter: [
      { name: 'messages', valueString: JSON.stringify(messages) },
      { name: 'model', valueString: model },
    ],
  });

  const content = response.parameter?.find((p: { name: string }) => p.name === 'content')?.valueString;
  const toolCallsStr = response.parameter?.find((p: { name: string }) => p.name === 'tool_calls')?.valueString;
  const toolCalls = toolCallsStr ? JSON.parse(toolCallsStr) : undefined;

  return { content, toolCalls };
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

  // Get initial bot response
  const initialResponse = await sendToBot(medplum, fhirRequestToolsId, currentMessages, selectedModel);
  const allResourceRefs: string[] = [];
  let content = initialResponse.content;

  // Process tool calls if present
  if (initialResponse.toolCalls) {
    const assistantMessageWithToolCalls: Message = {
      role: 'assistant',
      content: null,
      tool_calls: initialResponse.toolCalls,
    };
    currentMessages.push(assistantMessageWithToolCalls);

    if (activeTopicId) {
      await saveMessage(medplum, activeTopicId, assistantMessageWithToolCalls, currentMessages.length - 1);
    }

    // Execute all tool calls
    const { messages: toolMessages, resourceRefs } = await executeToolCalls(
      medplum,
      initialResponse.toolCalls,
      activeTopicId,
      setCurrentFhirRequest
    );
    currentMessages.push(...toolMessages);
    allResourceRefs.push(...resourceRefs);

    // Get summary response after tool execution
    const summaryResponse = await sendToBot(medplum, resourceSummaryBotId, currentMessages, selectedModel);
    content = summaryResponse.content;
  }

  const uniqueRefs = allResourceRefs.length > 0 ? [...new Set(allResourceRefs)] : undefined;
  const assistantMessage: Message = {
    role: 'assistant',
    content: content || 'I received your message but was unable to generate a response. Please try again.',
    resources: uniqueRefs,
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
