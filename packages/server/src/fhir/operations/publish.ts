import {
  CreateFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
} from '@aws-sdk/client-lambda';
import { allOk, assertOk } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { readFileSync } from 'fs';
import JSZip from 'jszip';
import { asyncWrap } from '../../async';
import { getConfig } from '../../config';
import { logger } from '../../logger';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';

export const publishHandler = asyncWrap(async (req: Request, res: Response) => {
  const { id } = req.params;
  const repo = res.locals.repo as Repository;
  const [outcome, bot] = await repo.readResource<Bot>('Bot', id);
  assertOk(outcome, bot);

  const client = new LambdaClient({ region: 'us-east-1' });
  const name = `medplum-bot-lambda-${bot.id}`;
  await deployLambda(client, name, bot.code as string);
  sendOutcome(res, allOk);
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
  // Add a small wrapper to set up the context
  zip.file(
    'index.mjs',
    `import fetch from './fetch.mjs';
    import { assertOk, createReference, LegacyRepositoryClient, MedplumClient } from './medplum.mjs';
    export async function handler(event, context) {
      const accessToken = event.accessToken;
      const medplum = new MedplumClient({ fetch });
      medplum.setAccessToken(accessToken);
      const repo = new LegacyRepositoryClient(medplum);
      // START USER CODE
      ${code}
      // END USER CODE
    }
    `
  );

  // Generate the zip as a Uint8Array
  return zip.generateAsync({ type: 'uint8array' });
}

async function lambdaExists(client: LambdaClient, name: string): Promise<boolean> {
  try {
    const command = new GetFunctionCommand({ FunctionName: name });
    const response = await client.send(command);
    return response.Configuration?.FunctionName === name;
  } catch (err) {
    return false;
  }
}

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

async function updateLambda(client: LambdaClient, name: string, zipFile: Uint8Array): Promise<void> {
  const command = new UpdateFunctionCodeCommand({
    FunctionName: name,
    ZipFile: zipFile,
    Publish: true,
  });
  const response = await client.send(command);
  logger.info('Updated lambda for bot', response.FunctionArn);
}
