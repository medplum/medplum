import { MedplumClient } from '@medplum/core';
import { createMedplumClient } from './util/client';
import { createMedplumCommand } from './util/command';
import { createBot, deployBot, readBotConfigs, saveBot } from './utils';

export const bot = createMedplumCommand('bot');

// Commands to deprecate
export const saveBotDeprecate = createMedplumCommand('save-bot');
export const deployBotDeprecate = createMedplumCommand('deploy-bot');
export const createBotDeprecate = createMedplumCommand('create-bot');

bot
  .command('save')
  .description('Saving the bot')
  .argument('<botName>')
  .action(async (botName, options) => {
    const medplum = await createMedplumClient(options);

    await botWrapper(medplum, botName);
  });

bot
  .command('deploy')
  .description('Deploy the app to AWS')
  .argument('<botName>')
  .action(async (botName, options) => {
    const medplum = await createMedplumClient(options);

    await botWrapper(medplum, botName, true);
  });

bot
  .command('create')
  .arguments('<botName> <projectId> <sourceFile> <distFile>')
  .description('Creating a bot')
  .action(async (botName, projectId, sourceFile, distFile, options) => {
    const medplum = await createMedplumClient(options);

    await createBot(medplum, [botName, projectId, sourceFile, distFile]);
  });

export async function botWrapper(medplum: MedplumClient, botName: string, deploy = false): Promise<void> {
  const botConfigs = readBotConfigs(botName);
  for (const botConfig of botConfigs) {
    const bot = await medplum.readResource('Bot', botConfig.id);
    await saveBot(medplum, botConfig, bot);
    if (deploy) {
      await deployBot(medplum, botConfig, bot);
    }
  }
  console.log(`Number of bots deployed: ${botConfigs.length}`);
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

    await createBot(medplum, [botName, projectId, sourceFile, distFile]);
  });
