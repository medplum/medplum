// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MEDPLUM_VERSION, normalizeErrorString } from '@medplum/core';
import { CommanderError, Option } from 'commander';
import dotenv from 'dotenv';
import { agent } from './agent';
import { login, token, whoami } from './auth';
import { buildAwsCommand } from './aws/index';
import { bot, createBotDeprecate, deployBotDeprecate, saveBotDeprecate } from './bots';
import { bulk } from './bulk';
import { hl7 } from './hl7';
import { profile } from './profiles';
import { project } from './project';
import { deleteObject, get, patch, post, put } from './rest';
import { MedplumCommand, addSubcommand } from './utils';

export async function main(argv: string[]): Promise<void> {
  const index = new MedplumCommand('medplum')
    .description('Command to access Medplum CLI')
    .option('--client-id <clientId>', 'FHIR server client id')
    .option('--client-secret <clientSecret>', 'FHIR server client secret')
    .option('--base-url <baseUrl>', 'FHIR server base URL, must be absolute')
    .option('--token-url <tokenUrl>', 'FHIR server token URL, absolute or relative to base URL')
    .option('--authorize-url <authorizeUrl>', 'FHIR server authorize URL, absolute or relative to base URL')
    .option('--fhir-url, --fhir-url-path <fhirUrlPath>', 'FHIR server URL, absolute or relative to base URL')
    .option('--scope <scope>', 'JWT scope')
    .option('--access-token <accessToken>', 'Access token for token exchange authentication')
    .option('--callback-url <callbackUrl>', 'Callback URL for authorization code flow')
    .option('--subject <subject>', 'Subject for JWT authentication')
    .option('--audience <audience>', 'Audience for JWT authentication')
    .option('--issuer <issuer>', 'Issuer for JWT authentication')
    .option('--private-key-path <privateKeyPath>', 'Private key path for JWT assertion')
    .option('-p, --profile <profile>', 'Profile name')
    .option('-v --verbose', 'Verbose output')
    .addOption(
      new Option('--auth-type <authType>', 'Type of authentication').choices([
        'basic',
        'client-credentials',
        'authorization-code',
        'jwt-bearer',
        'token-exchange',
        'jwt-assertion',
      ])
    )
    .on('option:verbose', () => {
      process.env.VERBOSE = '1';
    });

  // Configure CLI
  index.exitOverride();
  index.version(MEDPLUM_VERSION);
  index.configureHelp({ showGlobalOptions: true });

  // Auth commands
  addSubcommand(index, login);
  addSubcommand(index, whoami);
  addSubcommand(index, token);

  // REST commands
  addSubcommand(index, get);
  addSubcommand(index, post);
  addSubcommand(index, patch);
  addSubcommand(index, put);
  addSubcommand(index, deleteObject);

  // Project
  addSubcommand(index, project);

  // Bulk Commands
  addSubcommand(index, bulk);

  // Bot Commands
  addSubcommand(index, bot);

  // Agent Commands
  addSubcommand(index, agent);

  // Deprecated Bot Commands
  addSubcommand(index, saveBotDeprecate);
  addSubcommand(index, deployBotDeprecate);
  addSubcommand(index, createBotDeprecate);

  // Profile Commands
  addSubcommand(index, profile);

  // AWS commands
  addSubcommand(index, buildAwsCommand());

  // HL7 commands
  addSubcommand(index, hl7);

  try {
    await index.parseAsync(argv);
  } catch (err) {
    handleError(err as Error);
  }
}

export function handleError(err: Error | CommanderError): void {
  let exitCode = 1;
  let shouldPrint = true;
  if (err instanceof CommanderError) {
    // We return if not in verbose mode for CommanderErrors
    // Since commander.js will already log the error to console for us
    // Previously we didn't have this guard here and it would always double print errors
    if (!process.env.VERBOSE) {
      shouldPrint = false;
    }
    exitCode = err.exitCode;
  }
  if (exitCode !== 0 && shouldPrint) {
    writeErrorToStderr(err, !!process.env.VERBOSE);
    const cause = err.cause;
    if (process.env.VERBOSE) {
      if (Array.isArray(cause)) {
        for (const err of cause as Error[]) {
          writeErrorToStderr(err, true);
        }
      } else if (cause instanceof Error) {
        writeErrorToStderr(cause, true);
      }
    }
  }
  process.exit(exitCode);
}

function writeErrorToStderr(err: unknown, verbose = false): void {
  if (verbose) {
    console.error(err);
    return;
  }
  if (err instanceof CommanderError) {
    process.stderr.write(`${normalizeErrorString(err)}\n`);
  } else {
    process.stderr.write(`Error: ${normalizeErrorString(err)}\n`);
  }
}

export async function run(): Promise<void> {
  dotenv.config({ quiet: true });
  await main(process.argv);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error('Unhandled error:', normalizeErrorString(err));
    process.exit(1);
  });
}
