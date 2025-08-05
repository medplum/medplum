// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  CreateFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  GetFunctionConfigurationCommandOutput,
  LambdaClient,
  ListLayerVersionsCommand,
  PackageType,
  ResourceConflictException,
  ResourceNotFoundException,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import { sleep } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { ConfiguredRetryStrategy } from '@smithy/util-retry';
import JSZip from 'jszip';
import { getConfig } from '../../config/loader';
import { getLogger } from '../../logger';

export const LAMBDA_RUNTIME = 'nodejs20.x';
export const LAMBDA_HANDLER = 'index.handler';
export const LAMBDA_MEMORY = 1024;
export const DEFAULT_LAMBDA_TIMEOUT = 10;
export const MAX_LAMBDA_TIMEOUT = 900; // 60 * 15 (15 mins)

const WRAPPER_CODE = `const { ContentType, Hl7Message, MedplumClient } = require("@medplum/core");
const fetch = require("node-fetch");
const PdfPrinter = require("pdfmake");
const userCode = require("./user.js");

exports.handler = async (event, context) => {
  const { bot, baseUrl, accessToken, contentType, secrets, traceId, headers } = event;
  const medplum = new MedplumClient({
    baseUrl,
    fetch: function(url, options = {}) {
      options.headers ||= {};
      options.headers['X-Trace-Id'] = traceId;
      options.headers['traceparent'] = traceId;
      return fetch(url, options);
    },
    createPdf,
  });
  medplum.setAccessToken(accessToken);
  try {
    let input = event.input;
    if (contentType === ContentType.HL7_V2 && input) {
      input = Hl7Message.parse(input);
    }
    let result = await userCode.handler(medplum, { bot, input, contentType, secrets, traceId, headers });
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
};

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
`;

export function getLambdaNameForBot(bot: Bot): string {
  return `medplum-bot-lambda-${bot.id}`;
}

export async function getLambdaTimeoutForBot(bot: Bot): Promise<number> {
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
  let timeout: number;
  try {
    const command = new GetFunctionCommand({ FunctionName: name });
    const response = await client.send(command);
    timeout = response?.Configuration?.Timeout ?? DEFAULT_LAMBDA_TIMEOUT;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      timeout = DEFAULT_LAMBDA_TIMEOUT;
    } else {
      throw err;
    }
  }
  return timeout;
}

export async function deployLambda(bot: Bot, code: string): Promise<void> {
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
  log.info('Deploying lambda function for bot', { name });
  const zipFile = await createZipFile(code);
  log.debug('Lambda function zip size', { bytes: zipFile.byteLength });

  const exists = await lambdaExists(client, name);
  if (!exists) {
    await createLambda(bot, client, name, zipFile);
  } else {
    await updateLambda(bot, client, name, zipFile);
  }
}

async function createZipFile(code: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('user.js', code);
  zip.file('index.js', WRAPPER_CODE);
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * Returns true if the AWS Lambda exists for the bot name.
 * @param client - The AWS Lambda client.
 * @param name - The bot name.
 * @returns True if the bot exists.
 */
async function lambdaExists(client: LambdaClient, name: string): Promise<boolean> {
  try {
    const command = new GetFunctionCommand({ FunctionName: name });
    const response = await client.send(command);
    return response.Configuration?.FunctionName === name;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      return false;
    }
    throw err;
  }
}

/**
 * Creates a new AWS Lambda for the bot name.
 * @param bot - The Bot resource for this bot.
 * @param client - The AWS Lambda client.
 * @param name - The bot name.
 * @param zipFile - The zip file with the bot code.
 */
async function createLambda(bot: Bot, client: LambdaClient, name: string, zipFile: Uint8Array): Promise<void> {
  const layerVersion = await getLayerVersion(client);

  await client.send(
    new CreateFunctionCommand({
      FunctionName: name,
      Role: getConfig().botLambdaRoleArn,
      Runtime: LAMBDA_RUNTIME,
      Handler: LAMBDA_HANDLER,
      MemorySize: LAMBDA_MEMORY,
      PackageType: PackageType.Zip,
      Layers: [layerVersion],
      Code: {
        ZipFile: zipFile,
      },
      Publish: true,
      Timeout: bot.timeout ?? DEFAULT_LAMBDA_TIMEOUT, // seconds
    })
  );
}

/**
 * Updates an existing AWS Lambda for the bot name.
 * @param bot - The Bot resource for this bot.
 * @param client - The AWS Lambda client.
 * @param name - The bot name.
 * @param zipFile - The zip file with the bot code.
 */
async function updateLambda(bot: Bot, client: LambdaClient, name: string, zipFile: Uint8Array): Promise<void> {
  // First, make sure the lambda configuration is up to date
  await updateLambdaConfig(bot, client, name);

  // Then update the code
  await updateLambdaCode(client, name, zipFile);
}

/**
 * Updates the lambda configuration.
 * @param bot - The Bot resource for this bot.
 * @param client - The AWS Lambda client.
 * @param name - The lambda name.
 */
async function updateLambdaConfig(bot: Bot, client: LambdaClient, name: string): Promise<void> {
  const layerVersion = await getLayerVersion(client);
  const functionConfig = await getLambdaConfig(client, name);

  const timeout = bot.timeout ?? DEFAULT_LAMBDA_TIMEOUT;

  if (
    functionConfig.Runtime === LAMBDA_RUNTIME &&
    functionConfig.Handler === LAMBDA_HANDLER &&
    functionConfig.Layers?.[0].Arn === layerVersion &&
    functionConfig.Timeout === timeout
  ) {
    // Everything is up-to-date
    return;
  }

  // Need to update
  await client.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: name,
      Role: getConfig().botLambdaRoleArn,
      Runtime: LAMBDA_RUNTIME,
      Handler: LAMBDA_HANDLER,
      Layers: [layerVersion],
      Timeout: timeout,
    })
  );
}

async function getLambdaConfig(client: LambdaClient, name: string): Promise<GetFunctionConfigurationCommandOutput> {
  return client.send(
    new GetFunctionConfigurationCommand({
      FunctionName: name,
    })
  );
}

/**
 * Updates the AWS lambda code.
 * This function will retry up to 5 times if the lambda is busy.
 * @param client - The AWS Lambda client.
 * @param name - The lambda name.
 * @param zipFile - The zip file with the bot code.
 */
async function updateLambdaCode(client: LambdaClient, name: string, zipFile: Uint8Array): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await client.send(
        new UpdateFunctionCodeCommand({
          FunctionName: name,
          ZipFile: zipFile,
          Publish: true,
        })
      );
      return;
    } catch (err) {
      const isBusy = err instanceof ResourceConflictException;
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isBusy && !isLastAttempt) {
        // 1 sec, 2 sec, 4 sec, 8 sec
        await sleep(1000 * 2 ** attempt);
      } else {
        throw err;
      }
    }
  }
}

/**
 * Returns the latest layer version for the Medplum bot layer.
 * The first result is the latest version.
 * See: https://stackoverflow.com/a/55752188
 * @param client - The AWS Lambda client.
 * @returns The most recent layer version ARN.
 */
async function getLayerVersion(client: LambdaClient): Promise<string> {
  const command = new ListLayerVersionsCommand({
    LayerName: getConfig().botLambdaLayerName,
    MaxItems: 1,
  });
  const response = await client.send(command);
  return response.LayerVersions?.[0].LayerVersionArn as string;
}
