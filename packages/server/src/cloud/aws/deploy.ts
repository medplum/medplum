import {
  CreateFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  GetFunctionConfigurationCommandOutput,
  LambdaClient,
  ListLayerVersionsCommand,
  PackageType,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import { sleep } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { ConfiguredRetryStrategy } from '@smithy/util-retry';
import JSZip from 'jszip';
import { getConfig } from '../../config';
import { getRequestContext } from '../../context';

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

  const name = `medplum-bot-lambda-${bot.id}`;
  ctx.logger.info('Deploying lambda function for bot', { name });
  const zipFile = await createZipFile(code);
  ctx.logger.debug('Lambda function zip size', { bytes: zipFile.byteLength });

  const exists = await lambdaExists(client, name);
  if (!exists) {
    await createLambda(client, name, zipFile);
  } else {
    await updateLambda(client, name, zipFile);
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
  } catch (_err) {
    return false;
  }
}

/**
 * Creates a new AWS Lambda for the bot name.
 * @param client - The AWS Lambda client.
 * @param name - The bot name.
 * @param zipFile - The zip file with the bot code.
 */
async function createLambda(client: LambdaClient, name: string, zipFile: Uint8Array): Promise<void> {
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
      Timeout: 10, // seconds
    })
  );
}

/**
 * Updates an existing AWS Lambda for the bot name.
 * @param client - The AWS Lambda client.
 * @param name - The bot name.
 * @param zipFile - The zip file with the bot code.
 */
async function updateLambda(client: LambdaClient, name: string, zipFile: Uint8Array): Promise<void> {
  // First, make sure the lambda configuration is up to date
  await updateLambdaConfig(client, name);

  // Then update the code
  await client.send(
    new UpdateFunctionCodeCommand({
      FunctionName: name,
      ZipFile: zipFile,
      Publish: true,
    })
  );
}

/**
 * Updates the lambda configuration.
 * @param client - The AWS Lambda client.
 * @param name - The lambda name.
 */
async function updateLambdaConfig(client: LambdaClient, name: string): Promise<void> {
  const layerVersion = await getLayerVersion(client);
  const functionConfig = await getLambdaConfig(client, name);
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
      FunctionName: name,
      Role: getConfig().botLambdaRoleArn,
      Runtime: LAMBDA_RUNTIME,
      Handler: LAMBDA_HANDLER,
      Layers: [layerVersion],
    })
  );

  // Wait for the update to complete before returning
  // Wait up to 5 seconds
  // See: https://github.com/aws/aws-toolkit-visual-studio/issues/197
  // See: https://aws.amazon.com/blogs/compute/coming-soon-expansion-of-aws-lambda-states-to-all-functions/
  for (let i = 0; i < 5; i++) {
    const config = await getLambdaConfig(client, name);
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
