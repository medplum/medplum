import {
  CreateFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
} from '@aws-sdk/client-lambda';
import { allOk, assertOk, badRequest } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { readFileSync } from 'fs';
import JSZip from 'jszip';
import { asyncWrap } from '../../async';
import { getConfig } from '../../config';
import { logger } from '../../logger';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';

const WRAPPER_CODE = `import fetch from './fetch.mjs';
import { assertOk, createReference, Hl7Message, LegacyRepositoryClient, MedplumClient } from './medplum.mjs';
import * as userCode from './user.mjs';
export async function handler(event, context) {
  const { accessToken, input, contentType } = event.accessToken;
  const medplum = new MedplumClient({ fetch });
  medplum.setAccessToken(accessToken);
  const repo = new LegacyRepositoryClient(medplum);
  return userCode.handler(medplum, {
    input: contentType === 'x-application/hl7-v2+er7' ? Hl7Message.parse(input) : input,
    contentType,
  });
}
`;

const LOCAL_IMPORTS: Record<string, string> = {
  '@medplum/core': './medplum.mjs',
  'node-fetch': './fetch.mjs',
};

export const publishHandler = asyncWrap(async (req: Request, res: Response) => {
  const { id } = req.params;
  const repo = res.locals.repo as Repository;
  const [outcome, bot] = await repo.readResource<Bot>('Bot', id);
  assertOk(outcome, bot);

  const client = new LambdaClient({ region: 'us-east-1' });
  const name = `medplum-bot-lambda-${bot.id}`;
  try {
    await deployLambda(client, name, bot.code as string);
    sendOutcome(res, allOk);
  } catch (err) {
    sendOutcome(res, badRequest((err as Error).message));
  }
});

export async function deployLambda(client: LambdaClient, name: string, code: string): Promise<void> {
  logger.info('Deploying lambda function for bot: ' + name);
  const zipFile = await createZipFile(code);
  logger.debug('Lambda function zip size: ' + zipFile.byteLength);

  const exists = await lambdaExists(client, name);
  if (!exists) {
    await createLambda(client, name, zipFile);
  } else {
    await updateLambda(client, name, zipFile);
  }
}

async function createZipFile(code: string): Promise<Uint8Array> {
  // Start a new zip file
  const zip = new JSZip();

  // Add @medplum/core client library
  zip.file('medplum.mjs', readFileSync(require.resolve('@medplum/core').replace('cjs', 'esm'), 'utf8'));

  // Add node-fetch
  // node-fetch@2.6.7 has one dependency on 'whatwg-url' which is unnecessary
  // So we remove that all references to that depdendency
  zip.file(
    'fetch.mjs',
    readFileSync(require.resolve('node-fetch/lib/index.mjs'), 'utf8')
      .replace(`import whatwgUrl from 'whatwg-url';`, '')
      .replace(' || whatwgUrl.URL', '')
  );

  // Add the user code
  zip.file('user.mjs', preprocessBotCode(code));

  // Add a small wrapper to set up the context
  zip.file('index.mjs', WRAPPER_CODE);

  // Generate the zip as a Uint8Array
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * Preprocesses the user code to rewrite JavaScript imports.
 * When users author code, they should use normal import syntax.
 * When we deploy to AWS lambda, the file will not have access to a normal node_modules folder.
 * So we rewrite the approved list of imports to direct file imports.
 * @param input The original user code.
 * @returns The processed code that is ready to be deployed to AWS Lambda.
 */
export function preprocessBotCode(input: string): string {
  // Verify that there is an export statement
  if (!input.includes('export async function handler')) {
    throw new Error('Missing handler export');
  }

  let result = input;

  // Get all import statements
  // See: https://stackoverflow.com/a/69867053
  // See: https://regex101.com/r/0s3fBy/1
  const importRegex = /import\s*([\w\s{},*]+)\s*from\s*['"]([^'"\n]+)['"]/g;
  const matches = input.matchAll(importRegex);
  for (const match of matches) {
    const originalCode = match[0];
    const importString = match[1];
    const importPath = match[2];
    if (importPath in LOCAL_IMPORTS) {
      result = result.replace(originalCode, `import ${importString.trim()} from '${LOCAL_IMPORTS[importPath]}'`);
    } else {
      throw new Error('Unsupported import: ' + importPath);
    }
  }
  return result;
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
  const command = new CreateFunctionCommand({
    FunctionName: name,
    Role: getConfig().botLambdaRoleArn,
    Runtime: 'nodejs14.x',
    Handler: 'index.handler',
    Code: {
      ZipFile: zipFile,
    },
    Publish: true,
  });
  const response = await client.send(command);
  logger.info('Created lambda for bot', response.FunctionArn);
}

/**
 * Updates an existing AWS Lambda for the bot name.
 * @param client The AWS Lambda client.
 * @param name The bot name.
 * @param zipFile The zip file with the bot code.
 */
async function updateLambda(client: LambdaClient, name: string, zipFile: Uint8Array): Promise<void> {
  const command = new UpdateFunctionCodeCommand({
    FunctionName: name,
    ZipFile: zipFile,
    Publish: true,
  });
  const response = await client.send(command);
  logger.info('Updated lambda for bot', response.FunctionArn);
}
