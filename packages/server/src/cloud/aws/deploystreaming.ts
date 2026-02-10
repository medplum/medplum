// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LambdaClient } from '@aws-sdk/client-lambda';
import type { Bot } from '@medplum/fhirtypes';
import { ConfiguredRetryStrategy } from '@smithy/util-retry';
import JSZip from 'jszip';
import { getJsFileExtension } from '../../bots/utils';
import { getConfig } from '../../config/loader';
import { getLogger } from '../../logger';
import { createLambda, getLambdaNameForBot, lambdaExists, updateLambda } from './deploy';

export const LAMBDA_RUNTIME = 'nodejs22.x';
export const LAMBDA_HANDLER = 'index.handler';
export const LAMBDA_MEMORY = 1024;
export const DEFAULT_LAMBDA_TIMEOUT = 10;
export const MAX_LAMBDA_TIMEOUT = 900; // 60 * 15 (15 mins)

const CJS_PREFIX = `const { ContentType, Hl7Message, MedplumClient } = require("@medplum/core");
const PdfPrinter = require("pdfmake");
const userCode = require("./user.cjs");

exports.handler = awslambda.streamifyResponse(async (event, responseStream) => {
`;

const ESM_PREFIX = `import { ContentType, Hl7Message, MedplumClient } from '@medplum/core';
import PdfPrinter from 'pdfmake';
import * as userCode from './user.mjs';

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
`;

const WRAPPER_CODE = `
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
    if (!streaming || !botResponseStream.streamStarted) {
      writeResponse(responseStream, 200, result);
    }
  } catch (err) {
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
    if (!streaming || !botResponseStream.streamStarted) {
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

function createPdf(docDefinition, tableLayouts, fonts) {
  if (!fonts) {
    fonts = {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
      Roboto: {
        normal: '/opt/fonts/Roboto/Roboto-Regular.ttf',
        bold: '/opt/fonts/Roboto/Roboto-Medium.ttf',
        italics: '/opt/fonts/Roboto/Roboto-Italic.ttf',
        bolditalics: '/opt/fonts/Roboto/Roboto-MediumItalic.ttf'
      },
      Avenir: {
        normal: '/opt/fonts/Avenir/Avenir.ttf'
      }
    };
  }
  return new Promise((resolve, reject) => {
    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition, { tableLayouts });
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

function writeResponse(responseStream, statusCode, body) {
  responseStream.write(JSON.stringify({
    statusCode,
    headers: { 'Content-Type': 'application/json' } }) + "\\n");
  if (body !== undefined) {
    responseStream.write(JSON.stringify(body));
  }
  responseStream.end();
}
`;

export async function deployLambdaStreaming(bot: Bot, code: string): Promise<void> {
  const log = getLogger();

  if (bot.timeout !== undefined && bot.timeout > MAX_LAMBDA_TIMEOUT) {
    throw new Error('Bot timeout exceeds allowed maximum of 900 seconds');
  }

  // Create a new AWS Lambda client
  // Use a custom retry strategy to avoid throttling errors
  // This is especially important when updating lambdas which also
  // involve upgrading the layer version.
  const client = new LambdaClient({
    region: getConfig().awsRegion,
    retryStrategy: new ConfiguredRetryStrategy(
      5, // max attempts
      (attempt: number) => 500 * 2 ** attempt // Exponential backoff
    ),
  });

  const name = getLambdaNameForBot(bot);
  log.info('Deploying lambda streaming function for bot', { name });
  const zipFile = await createZipFile(bot, code);
  log.debug('Lambda streaming function zip size', { bytes: zipFile.byteLength });

  if (await lambdaExists(client, name)) {
    await updateLambda(bot, client, name, zipFile);
  } else {
    await createLambda(bot, client, name, zipFile);
  }
}

async function createZipFile(bot: Bot, code: string): Promise<Uint8Array> {
  const ext = getJsFileExtension(bot, code);
  const zip = new JSZip();
  if (ext === '.mjs') {
    zip.file(`user.mjs`, code);
    zip.file('index.mjs', ESM_PREFIX + WRAPPER_CODE);
  } else {
    zip.file(`user.cjs`, code);
    zip.file('index.cjs', CJS_PREFIX + WRAPPER_CODE);
  }
  return zip.generateAsync({ type: 'uint8array' });
}
