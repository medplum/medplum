import { MedplumClient } from '@medplum/core';
import { Command } from 'commander';
import { createMedplumClient } from './util/client';
import { createMedplumCommand } from './util/command';
import { createBot, deployBot, readBotConfigs, saveBot } from './utils';

const botSaveCommand = createMedplumCommand('save');
const botDeployCommand = createMedplumCommand('deploy');
const botCreateCommand = createMedplumCommand('create');

export const bot = new Command('bot')
  .addCommand(botSaveCommand)
  .addCommand(botDeployCommand)
  .addCommand(botCreateCommand);

// Commands to deprecate
export const saveBotDeprecate = createMedplumCommand('save-bot');
export const deployBotDeprecate = createMedplumCommand('deploy-bot');
export const createBotDeprecate = createMedplumCommand('create-bot');

botSaveCommand
  .description('Saving the bot')
  .argument('<botName>')
  .action(async (botName, options) => {
    const medplum = await createMedplumClient(options);

    await botWrapper(medplum, botName);
  });

botDeployCommand
  .description('Deploy the app to AWS')
  .argument('<botName>')
  .action(async (botName, options) => {
    const medplum = await createMedplumClient(options);

    await botWrapper(medplum, botName, true);
  });

botCreateCommand
  .arguments('<botName> <projectId> <sourceFile> <distFile>')
  .description('Creating a bot')
  .option('--runtime-version <runtimeVersion>', 'Runtime version (awslambda, vmcontext)')
  .option('--no-write-config', 'Do not write bot to config')
  .action(async (botName, projectId, sourceFile, distFile, options) => {
    const medplum = await createMedplumClient(options);

    await createBot(medplum, botName, projectId, sourceFile, distFile, options.runtimeVersion, !!options.writeConfig);
  });

export async function botWrapper(medplum: MedplumClient, botName: string, deploy = false): Promise<void> {
  const botConfigs = readBotConfigs(botName);
  const errors = [] as Error[];
  const errored = [] as string[];
  let saved = 0;
  let deployed = 0;

  for (const botConfig of botConfigs) {
    try {
      const bot = await medplum.readResource('Bot', botConfig.id);
      await saveBot(medplum, botConfig, bot);
      saved++;
      if (deploy) {
        await deployBot(medplum, botConfig, bot);
        deployed++;
      }
    } catch (err: unknown) {
      errors.push(err as Error);
      errored.push(`${botConfig.name} [${botConfig.id}]`);
    }
  }

  console.log(`Number of bots saved: ${saved}`);
  console.log(`Number of bots deployed: ${deployed}`);
  console.log(`Number of errors: ${errors.length}`);

  if (errors.length) {
    throw new Error(`${errors.length} bot(s) had failures. Bots with failures:\n\n    ${errored.join('\n    ')}`, {
      cause: errors,
    });
  }
}

// Deprecate bot commands
saveBotDeprecate
  .description('Saves the bot')
  .argument('<botName>')
  .action(async (botName, options) => {
    const medplum = await createMedplumClient(options);

    await botWrapper(medplum, botName);
  });

deployBotDeprecate
  .description('Deploy the bot to AWS')
  .argument('<botName>')
  .action(async (botName, options) => {
    const medplum = await createMedplumClient(options);

    await botWrapper(medplum, botName, true);
  });

createBotDeprecate
  .arguments('<botName> <projectId> <sourceFile> <distFile>')
  .description('Creates and saves the bot')
  .action(async (botName, projectId, sourceFile, distFile, options) => {
    const medplum = await createMedplumClient(options);

    await createBot(medplum, botName, projectId, sourceFile, distFile);
  });
