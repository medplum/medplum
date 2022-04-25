#!/usr/bin/env node
import { MedplumClient } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import fetch from 'node-fetch';
import { resolve } from 'path';

async function main(): Promise<void> {
  dotenv.config();

  if (process.argv.length < 3) {
    console.log('Usage: medplum <command>');
    return;
  }

  const command = process.argv[2];
  switch (command) {
    case 'deploy-bot':
      await deployBot();
      break;
    default:
      console.log(`Unknown command: ${command}`);
      break;
  }
}

async function getMedplumClient(): Promise<MedplumClient> {
  const clientId = process.env['MEDPLUM_CLIENT_ID'];
  if (!clientId) {
    throw new Error('MEDPLUM_CLIENT_ID is not set');
  }

  const clientSecret = process.env['MEDPLUM_CLIENT_SECRET'];
  if (!clientSecret) {
    throw new Error('MEDPLUM_CLIENT_SECRET is not set');
  }

  const medplum = new MedplumClient({ fetch });
  await medplum.clientCredentials(clientId, clientSecret);
  return medplum;
}

function getBotCode(filePath: string): string {
  let code = readFileSync(filePath, 'utf8');
  let functionName = undefined;
  let useAwait = false;

  const functionMatch = code.match(/export\s+function\s+(\w+)/);
  if (functionMatch) {
    functionName = functionMatch[1];
  }

  const asyncMatch = code.match(/export\s+async\s+function\s+(\w+)/);
  if (asyncMatch) {
    functionName = asyncMatch[1];
    useAwait = true;
  }

  code = code.replace(/export\s+/, '');
  if (functionName) {
    code += '\n\n';
    if (useAwait) {
      code += 'await ';
    }
    code += functionName + '(medplum, input);\n';
  }

  return code;
}

async function deployBot(): Promise<void> {
  if (process.argv.length < 5) {
    console.log('Usage: medplum deploy-bot <bot-name> <bot-id>');
    return;
  }

  const filePath = resolve(process.cwd(), process.argv[3]);
  if (!filePath) {
    console.log('Error: Could not resolve bot file path: ' + process.argv[3]);
    return;
  }

  if (!existsSync(filePath)) {
    console.log('Error: Bot file does not exist: ' + filePath);
    return;
  }

  const botId = process.argv[4];
  if (!botId) {
    console.log('Error: Bot ID is not set');
    return;
  }

  console.log('Deploying: ' + filePath);
  const medplum = await getMedplumClient();
  const bot = await medplum.readResource<Bot>('Bot', botId);
  if (!bot) {
    console.log('Error: Bot does not exist: ' + botId);
    return;
  }

  console.log('Bot', JSON.stringify(bot, null, 2));
  console.log('New bot code: ' + getBotCode(filePath));

  try {
    console.log('Update bot code.....');
    const result = await medplum.updateResource({
      ...bot,
      code: getBotCode(filePath),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log('Patch error: ', err);
  }
}

if (process.argv[1].includes('medplum') && process.argv[1].includes('cli')) {
  main().catch((err) => console.error('Unhandled error:', err));
}
