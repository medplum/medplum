// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot } from '@medplum/fhirtypes';
import { CREATE_PDF_CODE, createBotZipFile, deployLambdaInternal } from './deploy';

const CJS_PREFIX = `const { ContentType, getStatus, Hl7Message, isOperationOutcome, MedplumClient, OperationOutcomeError } = require("@medplum/core");
const PdfPrinter = require("pdfmake");
const userCode = require("./user.cjs");

exports.handler = awslambda.streamifyResponse(async (event, responseStream) => {
`;

const ESM_PREFIX = `import { ContentType, getStatus, Hl7Message, isOperationOutcome, MedplumClient, OperationOutcomeError } from '@medplum/core';
import PdfPrinter from 'pdfmake';
import * as userCode from './user.mjs';

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
`;

const WRAPPER_CODE =
  `
  const { bot, baseUrl, accessToken, requester, contentType, secrets, traceId, headers, streaming } = event;
  const medplum = new MedplumClient({
    baseUrl,
    fetch: function (url, options = {}) {
      options.headers ||= {};
      options.headers['X-Trace-Id'] = traceId;
      options.headers['traceparent'] = traceId;
      return fetch(url, options);
    },
    createPdf,
  });
  medplum.setAccessToken(accessToken);
  
  let botResponseStream = undefined;
  if (streaming) {
    botResponseStream = new BotResponseStream(responseStream);
  }

  try {
    let input = event.input;
    if (contentType === ContentType.HL7_V2 && input) {
      input = Hl7Message.parse(input);
    }
    let result = await userCode.handler(medplum, { bot, requester, input, contentType, secrets, traceId, headers, responseStream: botResponseStream });
    if (contentType === ContentType.HL7_V2 && result) {
      result = result.toString();
    }
    if (!streaming || !botResponseStream?.streamStarted) {
      writeResponse(responseStream, 200, result);
    }
  } catch (err) {
    if (err instanceof OperationOutcomeError || isOperationOutcome(err)) {
      const outcome = err instanceof OperationOutcomeError ? err.outcome : err;
      if (!streaming || !botResponseStream?.streamStarted) {
        writeResponse(responseStream, getStatus(outcome), outcome, ContentType.FHIR_JSON);
      }
      return;
    }

    let errorResponse;
    if (err instanceof Error) {
      console.log("Unhandled error: " + err.message + "\\n" + err.stack);
      errorResponse = {
        errorType: err.constructor?.name || "Error",
        errorMessage: err.message,
        stack: err.stack ? err.stack.split("\\n") : []
      };
    } else if (typeof err === "object") {
      console.log("Unhandled error: " + JSON.stringify(err, undefined, 2));
      errorResponse = {
        errorType: "Error",
        errorMessage: JSON.stringify(err),
        stack: []
      };
    } else {
      console.log("Unhandled error: " + err);
      errorResponse = {
        errorType: "Error",
        errorMessage: String(err),
        stack: []
      };
    }
    console.error("Invoke Error", JSON.stringify(errorResponse));
    if (!streaming || !botResponseStream?.streamStarted) {
      writeResponse(responseStream, 500, errorResponse);
    }
  }
});

class BotResponseStream {
  constructor(responseStream) {
    this.wrappedStream = responseStream;
    this.streamStarted = false;
  }
  startStreaming(statusCode, headers) {
    if (this.streamStarted) {
      return;
    }
    this.streamStarted = true;
    // Write metadata as JSON + newline for Medplum server to parse
    this.wrappedStream.write(JSON.stringify({ statusCode, headers }) + "\\n");
  }
  write(chunk) {
    if (!this.streamStarted) {
      throw new Error("Must call startStreaming() before write()");
    }
    return this.wrappedStream.write(chunk);
  }
  flush() {
    if (typeof this.wrappedStream.flush === 'function') {
      this.wrappedStream.flush();
    }
  }
  end(chunk) {
    if (chunk !== undefined) {
      this.wrappedStream.write(chunk);
    }
    this.wrappedStream.end();
  }
  on(event, listener) {
    return this.wrappedStream.on(event, listener);
  }
  once(event, listener) {
    return this.wrappedStream.once(event, listener);
  }
  emit(event, ...args) {
    return this.wrappedStream.emit(event, ...args);
  }
  get writable() {
    return this.wrappedStream.writable;
  }
}
` +
  CREATE_PDF_CODE +
  `
function writeResponse(responseStream, statusCode, body, contentType = 'application/json') {
  responseStream.write(JSON.stringify({
    statusCode,
    headers: { 'Content-Type': contentType } }) + "\\n");
  if (body !== undefined) {
    responseStream.write(JSON.stringify(body));
  }
  responseStream.end();
}
`;

export async function deployLambdaStreaming(bot: Bot, code: string): Promise<void> {
  return deployLambdaInternal(bot, code, createZipFile, 'streaming');
}

async function createZipFile(bot: Bot, code: string): Promise<Uint8Array> {
  return createBotZipFile(bot, code, CJS_PREFIX + WRAPPER_CODE, ESM_PREFIX + WRAPPER_CODE);
}
