import {
  CreateFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  LambdaClient,
  ListLayerVersionsCommand,
  PackageType,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import { allOk, badRequest, ContentType, getReferenceString } from '@medplum/core';
import { Binary, Bot } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import JSZip from 'jszip';
import { Readable } from 'stream';
import { asyncWrap } from '../../async';
import { getConfig } from '../../config';
import { sendOutcome } from '../outcomes';
import { systemRepo } from '../repo';
import { getBinaryStorage } from '../storage';
import { isBotEnabled } from './execute';
import { getAuthenticatedContext, getRequestContext } from '../../context';

const LAMBDA_RUNTIME = 'nodejs18.x';

const LAMBDA_HANDLER = 'index.handler';

const LAMBDA_MEMORY = 1024;

const WRAPPER_CODE = `const { ContentType, Hl7Message, MedplumClient } = require("@medplum/core");
const fetch = require("node-fetch");
const PdfPrinter = require("pdfmake");
const userCode = require("./user.js");

exports.handler = async (event, context) => {
  const { baseUrl, accessToken, contentType, secrets } = event;
  const medplum = new MedplumClient({
    baseUrl,
    fetch,
    createPdf,
  });
  medplum.setAccessToken(accessToken);
  try {
    let input = event.input;
    if (contentType === ContentType.HL7_V2 && input) {
      input = Hl7Message.parse(input);
    }
    let result = await userCode.handler(medplum, { input, contentType, secrets });
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

export const deployHandler = asyncWrap(async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;

  // Validate that the request body has a code property
  const code = req.body.code as string | undefined;
  if (!code) {
    sendOutcome(res, badRequest('Missing code'));
    return;
  }

  // First read the bot as the user to verify access
  await ctx.repo.readResource<Bot>('Bot', id);

  // Then read the bot as system user to load extended metadata
  const bot = await systemRepo.readResource<Bot>('Bot', id);

  if (!(await isBotEnabled(bot))) {
    sendOutcome(res, badRequest('Bots not enabled'));
    return;
  }

  try {
    const filename = req.body.filename ?? 'index.js';
    const contentType = ContentType.JAVASCRIPT;

    // Create a Binary for the executable code
    const binary = await ctx.repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType,
    });
    await getBinaryStorage().writeBinary(binary, filename, contentType, Readable.from(code));

    // Update the bot
    const updatedBot = await ctx.repo.updateResource<Bot>({
      ...bot,
      executableCode: {
        contentType,
        url: getReferenceString(binary),
        title: filename,
      },
    });

    // Deploy the bot
    if (updatedBot.runtimeVersion === 'awslambda') {
      await deployLambda(updatedBot, code);
    }

    sendOutcome(res, allOk);
  } catch (err) {
    sendOutcome(res, badRequest((err as Error).message));
  }
});

async function deployLambda(bot: Bot, code: string): Promise<void> {
  const ctx = getRequestContext();
  const client = new LambdaClient({ region: getConfig().awsRegion });
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
 * @param client The AWS Lambda client.
 * @param name The bot name.
 * @returns True if the bot exists.
 */
async function lambdaExists(client: LambdaClient, name: string): Promise<boolean> {
  try {
    const command = new GetFunctionCommand({ FunctionName: name });
    const response = await client.send(command);
    return response.Configuration?.FunctionName === name;
  } catch (err) {
    return false;
  }
}

/**
 * Creates a new AWS Lambda for the bot name.
 * @param client The AWS Lambda client.
 * @param name The bot name.
 * @param zipFile The zip file with the bot code.
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
 * @param client The AWS Lambda client.
 * @param name The bot name.
 * @param zipFile The zip file with the bot code.
 */
async function updateLambda(client: LambdaClient, name: string, zipFile: Uint8Array): Promise<void> {
  const layerVersion = await getLayerVersion(client);

  const functionConfig = await client.send(
    new GetFunctionConfigurationCommand({
      FunctionName: name,
    })
  );

  if (
    functionConfig.Runtime !== LAMBDA_RUNTIME ||
    functionConfig.Handler !== LAMBDA_HANDLER ||
    functionConfig.Layers?.[0].Arn !== layerVersion
  ) {
    await client.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: name,
        Role: getConfig().botLambdaRoleArn,
        Runtime: LAMBDA_RUNTIME,
        Handler: LAMBDA_HANDLER,
        Layers: [layerVersion],
      })
    );
  }

  await client.send(
    new UpdateFunctionCodeCommand({
      FunctionName: name,
      ZipFile: zipFile,
      Publish: true,
    })
  );
}

/**
 * Returns the latest layer version for the Medplum bot layer.
 * The first result is the latest version.
 * See: https://stackoverflow.com/a/55752188
 * @param client The AWS Lambda client.
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
