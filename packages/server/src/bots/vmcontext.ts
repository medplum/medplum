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
import { Binary, Reference } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import vm from 'node:vm';
import { getConfig } from '../config/loader';
import { getSystemRepo } from '../fhir/repo';
import { getBinaryStorage } from '../storage/loader';
import { MockConsole } from '../util/console';
import { readStreamToString } from '../util/streams';
import { BotExecutionContext, BotExecutionResult } from './types';

export const DEFAULT_VM_CONTEXT_TIMEOUT = 10000;

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

  const codeUrl = bot.executableCode?.url;
  if (!codeUrl) {
    return { success: false, logResult: 'No executable code' };
  }
  if (!codeUrl.startsWith('Binary/')) {
    return { success: false, logResult: 'Executable code is not a Binary' };
  }

  const systemRepo = getSystemRepo();
  const binary = await systemRepo.readReference<Binary>({ reference: codeUrl } as Reference<Binary>);
  const stream = await getBinaryStorage().readBinary(binary);
  const code = await readStreamToString(stream);
  const botConsole = new MockConsole();

  const sandbox = {
    console: botConsole,
    fetch,
    require,
    ContentType,
    Hl7Message,
    MedplumClient,
    TextEncoder,
    URL,
    URLSearchParams,
    event: {
      bot: createReference(bot),
      baseUrl: config.vmContextBaseUrl ?? config.baseUrl,
      accessToken: request.accessToken,
      input: input instanceof Hl7Message ? input.toString() : input,
      contentType,
      secrets: request.secrets,
      traceId,
      headers,
      defaultHeaders: request.defaultHeaders,
    },
  };

  const options: vm.RunningScriptOptions = {
    timeout: bot.timeout ? bot.timeout * 1000 : DEFAULT_VM_CONTEXT_TIMEOUT,
  };

  // Wrap code in an async block for top-level await support
  const wrappedCode = `
  const exports = {};
  const module = {exports};

  // Start user code
  ${code}
  // End user code

  (async () => {
    const { bot, baseUrl, accessToken, contentType, secrets, traceId, headers, defaultHeaders } = event;
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
      let result = await exports.handler(medplum, { bot, input, contentType, secrets, traceId, headers });
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

  // Return the result of the code execution
  try {
    const returnValue = (await vm.runInNewContext(wrappedCode, sandbox, options)) as any;
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
