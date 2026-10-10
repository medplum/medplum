// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { getDisplayString, getReferenceString, isNotFound, OperationOutcomeError } from '@medplum/core';
import type { Bundle, Communication, Identifier, Resource, ResourceType } from '@medplum/fhirtypes';
import type { Message } from '../types/spaces';
import type { ReasoningEffort } from './spaceModels';
import { createConversationTopic, saveMessage } from './spacePersistence';

const fhirRequestToolsId: Identifier = {
  value: 'ai-fhir-request-tools',
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

const noop = (): void => undefined;

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

async function executeFhirRequest(medplum: MedplumClient, args: FhirRequestArgs): Promise<Resource> {
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
        const startMatch = this.buffer.match(/```[\w+-]*[ \t]*\r?\n/);
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

function toolErrorMessage(toolCall: ToolCall, message: string, details?: string): Message {
  return {
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify({ error: true, message, ...(details !== undefined && { details }) }),
  };
}

/**
 * Runs every tool call and returns one tool message per call. OpenAI requires a reply for
 * every tool_call_id, so a call that cannot be parsed or executed still produces a message,
 * carrying the error back to the model instead of throwing.
 * @param medplum - The Medplum client instance
 * @param toolCalls - The tool calls requested by the model
 * @param onFhirRequest - Called with a short description before each FHIR request runs
 * @returns The tool messages and the references of every resource they returned
 */
export async function executeToolCalls(
  medplum: MedplumClient,
  toolCalls: ToolCall[],
  onFhirRequest?: (request: string) => void
): Promise<ExecuteToolCallsResult> {
  const messages: Message[] = [];
  const resourceRefs: string[] = [];

  for (const toolCall of toolCalls) {
    if (toolCall.function.name === 'fhir_request') {
      let args: FhirRequestArgs | undefined;
      try {
        args =
          typeof toolCall.function.arguments === 'string'
            ? (JSON.parse(toolCall.function.arguments) as FhirRequestArgs)
            : (toolCall.function.arguments as unknown as FhirRequestArgs);
      } catch (err) {
        const details = err instanceof Error ? err.message : 'Unknown error';
        messages.push(toolErrorMessage(toolCall, 'Invalid tool arguments', details));
        continue;
      }

      onFhirRequest?.(`${args.method} ${args.path}`);

      try {
        const result = await executeFhirRequest(medplum, args);
        resourceRefs.push(...extractResourceRefs(result));
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        const details = err instanceof Error ? err.message : 'Unknown error';
        messages.push(toolErrorMessage(toolCall, `Unable to execute ${args.method}: ${args.path}`, details));
      }
    } else if (toolCall.function.name === 'set_visualization') {
      // Acknowledge visualization tool call (handled separately via visualize flag)
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({ acknowledged: true }),
      });
    } else {
      messages.push(toolErrorMessage(toolCall, `Unrecognized tool: ${toolCall.function.name}`));
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

/**
 * Finds the bot to run for an identifier. A project can hold several bots with the same
 * identifier (an old copy next to a redeployed one), so the most recently updated wins.
 * @param medplum - The Medplum client
 * @param identifier - The bot identifier
 * @returns The bot id
 */
export async function resolveBotId(medplum: MedplumClient, identifier: Identifier): Promise<string> {
  const bot = await medplum.searchOne('Bot', {
    identifier: `${identifier.system}|${identifier.value}`,
    _sort: '-_lastUpdated',
  });
  if (!bot?.id) {
    throw new Error(`Bot not found: ${identifier.value}`);
  }
  return bot.id;
}

export async function sendToBot(
  medplum: MedplumClient,
  botId: Identifier,
  messages: Message[],
  model: string,
  reasoningEffort: ReasoningEffort
): Promise<{ content?: string; toolCalls?: ToolCall[]; visualize?: boolean }> {
  const response = await medplum.executeBot(await resolveBotId(medplum, botId), {
    resourceType: 'Parameters',
    parameter: [
      { name: 'messages', valueString: JSON.stringify(toApiMessages(messages)) },
      { name: 'model', valueString: model },
      { name: 'reasoning_effort', valueString: reasoningEffort },
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

/**
 * Reads the error carried by an SSE frame, if any. The server reports a failure mid-stream
 * as a frame with an `error` field rather than a non-2xx status.
 * @param parsed - The parsed SSE frame
 * @returns The error message, or undefined when the frame is not an error
 */
function streamErrorMessage(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object' || !('error' in parsed)) {
    return undefined;
  }
  const error: unknown = parsed.error;
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return undefined;
}

export async function sendToBotStreaming(
  medplum: MedplumClient,
  botId: Identifier,
  messages: Message[],
  model: string,
  reasoningEffort: ReasoningEffort,
  onChunk: (chunk: string) => void,
  additionalParams?: { name: string; valueString: string }[]
): Promise<StreamingResult> {
  const url = medplum.fhirUrl('Bot', await resolveBotId(medplum, botId), '$execute').toString();
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
        { name: 'reasoning_effort', valueString: reasoningEffort },
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

        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        const streamError = streamErrorMessage(parsed);
        if (streamError) {
          throw new Error(streamError);
        }

        const frame = parsed as { content?: string; choices?: { delta?: { content?: string } }[] };
        const chunk = frame.content || frame.choices?.[0]?.delta?.content;
        if (chunk) {
          fullContent += chunk;
          codeExtractor.process(chunk);
          onChunk(chunk);
        }
      }
    }
  }

  return { content: fullContent, code: codeExtractor.getCode() };
}

/**
 * Progress callbacks fired while a message is processed. All are optional.
 */
export interface ProcessMessageEvents {
  /** The first message of a conversation created this topic. */
  onTopicCreated?: (topic: Communication) => void;
  /** The conversation grew (tool calls, tool replies); receives a copy of it so far. */
  onProgress?: (messages: Message[]) => void;
  /** A FHIR request is about to run (description), or has finished (undefined). */
  onFhirRequest?: (request: string | undefined) => void;
  /** A chunk of the summary response was received. */
  onStreamChunk?: (chunk: string) => void;
  /** Component generation has begun; the first code chunk may take a while. */
  onComponentStart?: () => void;
  /** A chunk of the generated component code was received. */
  onComponentStreamChunk?: (chunk: string) => void;
}

export interface ProcessMessageOptions {
  medplum: MedplumClient;
  /** The conversation so far, before the user message. Never mutated. */
  messages: Message[];
  /** The message being sent. Its selectedPatients, if any, are added as context. */
  userMessage: Message;
  /** The current topic. When undefined, a topic is created from the user message. */
  topicId: string | undefined;
  model: string;
  reasoningEffort: ReasoningEffort;
  events?: ProcessMessageEvents;
}

export interface ProcessMessageResult {
  topicId: string | undefined;
  assistantMessage: Message;
  /** The full conversation after this exchange: input messages, user message, tool turns, reply. */
  messages: Message[];
}

const MAX_AGENT_ITERATIONS = 10;

/**
 * Sends a user message through the agent loop and returns the resulting conversation.
 *
 * The function is pure with respect to its inputs: `messages` is copied, not mutated, and
 * every intermediate message (patient context, tool calls, tool replies) is appended to the
 * copy returned in the result. Persistence happens as the exchange progresses so a failure
 * mid-loop leaves the stored conversation consistent.
 * @param options - The message, conversation and model settings
 * @returns The new topic id (if created), the assistant reply and the full message list
 */
export async function processMessage(options: ProcessMessageOptions): Promise<ProcessMessageResult> {
  const { medplum, messages, userMessage, model, reasoningEffort, events = {} } = options;
  const next: Message[] = [...messages, userMessage];

  let topicId = options.topicId;
  if (!topicId) {
    const newTopic = await createConversationTopic(medplum, (userMessage.content ?? '').substring(0, 100), model);
    topicId = newTopic.id;
    events.onTopicCreated?.(newTopic);
  }

  const persist = async (message: Message, sequenceNumber: number): Promise<void> => {
    if (topicId) {
      await saveMessage(medplum, topicId, message, sequenceNumber);
    }
  };

  await persist(userMessage, next.length - 1);

  const selectedPatients = userMessage.selectedPatients ?? [];
  if (selectedPatients.length > 0) {
    const patientLines = selectedPatients.map((p) => {
      const displayName = 'resourceType' in p ? getDisplayString(p) : (p.display ?? 'Unknown');
      return `- ${displayName} (${getReferenceString(p)})`;
    });
    next.push({
      role: 'system',
      content: `The user has pre-selected the following patient(s) for this request. Use these patient references when the request involves a patient and do not ask which patient:\n${patientLines.join('\n')}`,
    });
  }

  const allResourceRefs: string[] = [];
  let visualize = false;
  let content: string | undefined;
  let loopCompleted = false;

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    const translatorResponse = await sendToBot(medplum, fhirRequestToolsId, next, model, reasoningEffort);

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
    next.push(assistantMessageWithToolCalls);
    const assistantSequence = next.length - 1;
    events.onProgress?.([...next]);

    const { messages: toolMessages, resourceRefs } = await executeToolCalls(
      medplum,
      translatorResponse.toolCalls,
      (request) => events.onFhirRequest?.(`Step ${iteration + 1}: ${request}`)
    );
    next.push(...toolMessages);
    allResourceRefs.push(...resourceRefs);
    events.onProgress?.([...next]);

    // Persist per-iteration (keeps DB recoverable if mid-loop failure). The tool_calls
    // message goes first so a truncated reload never sees tool replies without it.
    await persist(assistantMessageWithToolCalls, assistantSequence);
    for (let i = 0; i < toolMessages.length; i++) {
      await persist(toolMessages[i], assistantSequence + 1 + i);
    }

    // Reset FHIR indicator while bot thinks about next step
    events.onFhirRequest?.(undefined);
  }

  // The translator bot only decides tool calls and writes little or no prose. Once a
  // conversation holds tool results, every reply (even on turns without new tool calls)
  // comes from the summary bot, which writes the answer and streams it.
  if (next.some((m) => m.role === 'tool')) {
    const result = await sendToBotStreaming(
      medplum,
      resourceSummaryBotSseId,
      next,
      model,
      reasoningEffort,
      events.onStreamChunk ?? noop
    );
    content = result.content;
  }

  if (!loopCompleted && content) {
    content +=
      '\n\n_Note: The request reached the processing limit before fully completing. Try a more specific question or break it into smaller parts._';
  } else if (!loopCompleted) {
    content =
      'The request reached the processing limit before any results could be gathered. Try a more specific question or break it into smaller parts.';
  }

  let componentCode: string | undefined;
  if (visualize && allResourceRefs.length > 0) {
    events.onComponentStart?.();
    const fhirData = await collectFhirData(medplum, allResourceRefs);
    const result = await sendToBotStreaming(
      medplum,
      componentGeneratorBotSseId,
      next,
      model,
      reasoningEffort,
      events.onComponentStreamChunk ?? events.onStreamChunk ?? noop,
      [{ name: 'fhirData', valueString: JSON.stringify(fhirData) }]
    );
    componentCode = result.code;
  }

  const uniqueRefs = allResourceRefs.length > 0 ? [...new Set(allResourceRefs)] : undefined;
  const assistantMessage: Message = {
    role: 'assistant',
    content: content || 'I received your message but was unable to generate a response. Please try again.',
    resources: uniqueRefs,
    componentCode,
  };

  await persist(assistantMessage, next.length);

  return {
    topicId,
    assistantMessage,
    messages: [...next, assistantMessage],
  };
}
