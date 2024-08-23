import {
  CreateFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  GetFunctionConfigurationCommandOutput,
  LambdaClient,
  ListLayerVersionsCommand,
  PackageType,
  TagResourceCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import { sleep } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { ConfiguredRetryStrategy } from '@smithy/util-retry';
import JSZip from 'jszip';
import { getConfig } from '../../config';
import { getRequestContext } from '../../context';

type BotMeta = {
  project: string;
  versionId: string;
  id: string;
  name?: string;
};

const LAMBDA_RUNTIME = 'nodejs18.x';

const LAMBDA_HANDLER = 'index.handler';

const LAMBDA_MEMORY = 1024;

const WRAPPER_CODE = `const { ContentType, Hl7Message, MedplumClient } = require("@medplum/core");
const fetch = require("node-fetch");
const PdfPrinter = require("pdfmake");
const userCode = require("./user.js");

exports.handler = async (event, context) => {
  const { bot, baseUrl, accessToken, contentType, secrets, traceId } = event;
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
    let result = await userCode.handler(medplum, { bot, input, contentType, secrets, traceId });
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

export async function deployLambda(bot: Bot, code: string): Promise<void> {
  const ctx = getRequestContext();

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

  ctx.logger.info('Deploying lambda function for bot', { botId: bot.id });
  const zipFile = await createZipFile(code);
  ctx.logger.debug('Lambda function zip size', { bytes: zipFile.byteLength });

  if (!bot.id) {
    throw new Error('Bot id is required');
  }

  if (!bot.meta?.versionId) {
    throw new Error('Bot versionId is required');
  }

  if (!bot.meta?.project) {
    throw new Error('Bot project is required');
  }

  const botMeta = {
    project: bot.meta.project,
    versionId: bot.meta.versionId,
    id: bot.id,
    name: bot.name,
  } satisfies BotMeta;

  const exists = await lambdaExists(client, bot.id);
  if (!exists) {
    await createLambda(client, botMeta, zipFile);
  } else {
    await updateLambda(client, botMeta, zipFile);
  }
}

async function createZipFile(code: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('user.js', code);
  zip.file('index.js', WRAPPER_CODE);
  return zip.generateAsync({ type: 'uint8array' });
}

async function getLambdaArn(client: LambdaClient, botId: string): Promise<string> {
  const name = `medplum-bot-lambda-${botId}`;
  const command = new GetFunctionCommand({ FunctionName: name });
  const response = await client.send(command);
  return response.Configuration?.FunctionArn as string;
}

/**
 * Returns true if the AWS Lambda exists for the bot name.
 * @param client - The AWS Lambda client.
 * @param botId - The bot id.
 * @returns True if the bot exists.
 */
async function lambdaExists(client: LambdaClient, botId: string): Promise<boolean> {
  try {
    const name = `medplum-bot-lambda-${botId}`;
    const command = new GetFunctionCommand({ FunctionName: name });
    const response = await client.send(command);
    return response.Configuration?.FunctionName === name;
  } catch (_err) {
    return false;
  }
}

/**
 * Creates a new AWS Lambda for the bot name.
 * @param client - The AWS Lambda client.
 * @param botMeta - Bot name, id, and other useful info.
 * @param zipFile - The zip file with the bot code.
 */
async function createLambda(client: LambdaClient, botMeta: BotMeta, zipFile: Uint8Array): Promise<void> {
  const layerVersion = await getLayerVersion(client);
  const { id: botId, name, project } = botMeta;
  const lambdaName = `medplum-bot-lambda-${botId}`;

  await client.send(
    new CreateFunctionCommand({
      FunctionName: lambdaName,
      Role: getConfig().botLambdaRoleArn,
      Runtime: LAMBDA_RUNTIME,
      Handler: LAMBDA_HANDLER,
      MemorySize: LAMBDA_MEMORY,
      PackageType: PackageType.Zip,
      Layers: [layerVersion],
      Code: {
        ZipFile: zipFile,
      },
      Tags: {
        'medplum-bot-name': name ?? '',
        'medplum-bot-id': botId,
        'medplum-project-id': project,
        'medplum-bot-version-id': botMeta.versionId,
      },
      Publish: true,
      Timeout: 10, // seconds
    })
  );
}

/**
 * Updates an existing AWS Lambda for the bot name.
 * @param client - The AWS Lambda client.
 * @param botMeta - Bot name, id, and other useful info.
 * @param zipFile - The zip file with the bot code.
 */
async function updateLambda(client: LambdaClient, botMeta: BotMeta, zipFile: Uint8Array): Promise<void> {
  // First, make sure the lambda configuration is up to date
  await updateLambdaConfig(client, botMeta);
  const { id: botId } = botMeta;
  const arn = await getLambdaArn(client, botId);

  await client.send(
    new TagResourceCommand({
      Resource: arn,
      Tags: {
        'medplum-bot-id': botId,
        'medplum-bot-name': botMeta.name ?? '',
        'medplum-project-id': botMeta.project,
        'medplum-bot-version-id': botMeta.versionId,
      },
    })
  );

  // Then update the code
  await client.send(
    new UpdateFunctionCodeCommand({
      FunctionName: `medplum-bot-lambda-${botId}`,
      ZipFile: zipFile,
      Publish: true,
    })
  );
}

/**
 * Updates the lambda configuration.
 * @param client - The AWS Lambda client.
 * @param botMeta - The bot id, name, etc.
 */
async function updateLambdaConfig(client: LambdaClient, botMeta: BotMeta): Promise<void> {
  const { id: botId, name: botName } = botMeta;
  const layerVersion = await getLayerVersion(client);
  const lambdaName = `medplum-bot-lambda-${botId}`;
  const functionConfig = await getLambdaConfig(client, lambdaName);
  if (
    functionConfig.Runtime === LAMBDA_RUNTIME &&
    functionConfig.Handler === LAMBDA_HANDLER &&
    functionConfig.Layers?.[0].Arn === layerVersion
  ) {
    // Everything is up-to-date
    return;
  }

  // Need to update
  await client.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: lambdaName,
      Role: getConfig().botLambdaRoleArn,
      Runtime: LAMBDA_RUNTIME,
      Handler: LAMBDA_HANDLER,
      Layers: [layerVersion],
      Description: botName,
    })
  );

  // Wait for the update to complete before returning
  // Wait up to 5 seconds
  // See: https://github.com/aws/aws-toolkit-visual-studio/issues/197
  // See: https://aws.amazon.com/blogs/compute/coming-soon-expansion-of-aws-lambda-states-to-all-functions/
  for (let i = 0; i < 5; i++) {
    const config = await getLambdaConfig(client, lambdaName);
    // Valid Values: Pending | Active | Inactive | Failed
    // See: https://docs.aws.amazon.com/lambda/latest/dg/API_GetFunctionConfiguration.html
    if (config.State === 'Active') {
      return;
    }
    await sleep(1000);
  }
}

async function getLambdaConfig(client: LambdaClient, name: string): Promise<GetFunctionConfigurationCommandOutput> {
  return client.send(
    new GetFunctionConfigurationCommand({
      FunctionName: name,
    })
  );
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
