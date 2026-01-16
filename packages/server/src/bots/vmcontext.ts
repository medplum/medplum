// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ContentType,
  createReference,
  Hl7Message,
  MedplumClient,
  normalizeErrorString,
  normalizeOperationOutcome,
} from '@medplum/core';
import type { Binary, Reference } from '@medplum/fhirtypes';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { getConfig } from '../config/loader';
import { getSystemRepo } from '../fhir/repo';
import { getBinaryStorage } from '../storage/loader';
import { MockConsole } from '../util/console';
import { readStreamToString } from '../util/streams';
import type { BotExecutionContext, BotExecutionResult, BotStreamingResult, StreamingChunk } from './types';

export const DEFAULT_VM_CONTEXT_TIMEOUT = 10000;

/**
 * Validates the bot's executable code URL.
 * @param bot - The bot to validate.
 * @returns The code URL if valid, or an error message string starting with 'Error:'.
 */
function getCodeUrl(bot: BotExecutionContext['bot']): { url: string } | { error: string } {
  const codeUrl = bot.executableCode?.url;
  if (!codeUrl) {
    return { error: 'No executable code' };
  }
  if (!codeUrl.startsWith('Binary/')) {
    return { error: 'Executable code is not a Binary' };
  }
  return { url: codeUrl };
}

/**
 * Loads the bot's executable code from storage.
 * @param codeUrl - The URL of the executable code Binary.
 * @returns The code string.
 */
async function loadBotCode(codeUrl: string): Promise<string> {
  const systemRepo = getSystemRepo();
  const binary = await systemRepo.readReference<Binary>({ reference: codeUrl } as Reference<Binary>);
  const stream = await getBinaryStorage().readBinary(binary);
  return readStreamToString(stream);
}

/**
 * Creates VM running script options for bot execution.
 * @param bot - The bot to execute.
 * @returns The VM running script options.
 */
function createVmOptions(bot: BotExecutionContext['bot']): vm.RunningScriptOptions {
  return {
    timeout: bot.timeout ? bot.timeout * 1000 : DEFAULT_VM_CONTEXT_TIMEOUT,
  };
}

interface SandboxEvent {
  bot: ReturnType<typeof createReference>;
  baseUrl: string;
  accessToken: string;
  requester: BotExecutionContext['requester'];
  input: unknown;
  contentType: string;
  secrets: BotExecutionContext['secrets'];
  traceId: string | undefined;
  headers: BotExecutionContext['headers'];
  defaultHeaders: BotExecutionContext['defaultHeaders'];
  onChunk?: (chunk: StreamingChunk) => Promise<void>;
}

/**
 * Creates the VM sandbox object for bot execution.
 * @param botConsole - The mock console for the bot.
 * @param event - The event object to expose to the bot.
 * @returns The sandbox object.
 */
function createSandbox(botConsole: MockConsole, event: SandboxEvent): vm.Context {
  return {
    console: botConsole,
    fetch: globalThis.fetch,
    require: createRequire(typeof __filename === 'undefined' ? import.meta.url : __filename),
    ContentType,
    Hl7Message,
    MedplumClient,
    TextDecoder,
    TextEncoder,
    TextDecoderStream,
    TextEncoderStream,
    ReadableStream,
    WritableStream,
    TransformStream,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    event,
  };
}

/**
 * Generates the wrapped code template for VM execution.
 * @param code - The bot's executable code.
 * @param streaming - Whether to include streaming support (onChunk).
 * @returns The wrapped code string.
 */
function generateWrappedCode(code: string, streaming: boolean): string {
  const eventDestructure = streaming
    ? 'const { bot, baseUrl, accessToken, requester, contentType, secrets, traceId, headers, defaultHeaders, onChunk } = event;'
    : 'const { bot, baseUrl, accessToken, requester, contentType, secrets, traceId, headers, defaultHeaders } = event;';

  const handlerCall = streaming
    ? 'let result = await exports.handler(medplum, { bot, requester, input, contentType, secrets, traceId, headers, onChunk });'
    : 'let result = await exports.handler(medplum, { bot, requester, input, contentType, secrets, traceId, headers });';

  return `
  const exports = {};
  const module = {exports};

  // Start user code
  ${code}
  // End user code

  (async () => {
    ${eventDestructure}
    const medplum = new MedplumClient({
      baseUrl,
      defaultHeaders,
      fetch: function(url, options = {}) {
        options.headers ||= {};
        options.headers['X-Trace-Id'] = traceId;
        options.headers['traceparent'] = traceId;
        return fetch(url, options);
      },
    });
    medplum.setAccessToken(accessToken);
    try {
      let input = event.input;
      if (contentType === ContentType.HL7_V2 && input) {
        input = Hl7Message.parse(input);
      }
      ${handlerCall}
      if (contentType === ContentType.HL7_V2 && result) {
        result = result.toString();
      }
      return result;
    } catch (err) {
      if (err instanceof Error) {
        console.log("Unhandled error: " + err.message + "\\n" + err.stack);
      } else if (typeof err === "object") {
        console.log("Unhandled error: " + JSON.stringify(err, undefined, 2));
      } else {
        console.log("Unhandled error: " + err);
      }
      throw err;
    }
  })();
  `;
}

/**
 * Executes a Bot on the server in a separate Node.js VM.
 * @param request - The bot request.
 * @returns The bot execution result.
 */
export async function runInVmContext(request: BotExecutionContext): Promise<BotExecutionResult> {
  const { bot, input, contentType, traceId, headers } = request;

  const config = getConfig();
  if (!config.vmContextBotsEnabled) {
    return { success: false, logResult: 'VM Context bots not enabled on this server' };
  }

  const codeUrlResult = getCodeUrl(bot);
  if ('error' in codeUrlResult) {
    return { success: false, logResult: codeUrlResult.error };
  }

  const code = await loadBotCode(codeUrlResult.url);
  const botConsole = new MockConsole();

  const sandbox = createSandbox(botConsole, {
    bot: createReference(bot),
    baseUrl: config.vmContextBaseUrl ?? config.baseUrl,
    accessToken: request.accessToken,
    requester: request.requester,
    input: input instanceof Hl7Message ? input.toString() : input,
    contentType,
    secrets: request.secrets,
    traceId,
    headers,
    defaultHeaders: request.defaultHeaders,
  });

  const wrappedCode = generateWrappedCode(code, false);
  const options = createVmOptions(bot);

  // Return the result of the code execution
  try {
    const returnValue = await vm.runInNewContext(wrappedCode, sandbox, options);
    return {
      success: true,
      logResult: botConsole.toString(),
      returnValue,
    };
  } catch (err) {
    botConsole.log('Error', normalizeErrorString(err));
    return {
      success: false,
      logResult: botConsole.toString(),
      returnValue: normalizeOperationOutcome(err),
    };
  }
}

/**
 * Executes a Bot on the server in a separate Node.js VM with streaming support.
 * @param request - The bot request with streaming callback.
 * @returns The bot streaming execution result.
 */
export async function runInVmContextStreaming(request: BotExecutionContext): Promise<BotStreamingResult> {
  const { bot, input, contentType, traceId, headers, streamingCallback } = request;

  const config = getConfig();
  if (!config.vmContextBotsEnabled) {
    return { streaming: true, success: false, logResult: 'VM Context bots not enabled on this server' };
  }

  const codeUrlResult = getCodeUrl(bot);
  if ('error' in codeUrlResult) {
    return { streaming: true, success: false, logResult: codeUrlResult.error };
  }

  const code = await loadBotCode(codeUrlResult.url);
  const botConsole = new MockConsole();

  const sandbox = createSandbox(botConsole, {
    bot: createReference(bot),
    baseUrl: config.vmContextBaseUrl ?? config.baseUrl,
    accessToken: request.accessToken,
    requester: request.requester,
    input: input instanceof Hl7Message ? input.toString() : input,
    contentType,
    secrets: request.secrets,
    traceId,
    headers,
    defaultHeaders: request.defaultHeaders,
    onChunk: async (chunk: StreamingChunk) => {
      if (streamingCallback) {
        await streamingCallback(chunk);
      }
    },
  });

  const wrappedCode = generateWrappedCode(code, true);
  const options = createVmOptions(bot);

  // Return the result of the code execution
  try {
    await vm.runInNewContext(wrappedCode, sandbox, options);
    return {
      streaming: true,
      success: true,
      logResult: botConsole.toString(),
    };
  } catch (err) {
    botConsole.log('Error', normalizeErrorString(err));
    return {
      streaming: true,
      success: false,
      logResult: botConsole.toString(),
    };
  }
}
