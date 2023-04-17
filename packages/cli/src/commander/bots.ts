import { Command } from 'commander';
import { medplum } from '.';
import { createBot, deployBot, readBotConfigs, saveBot } from './utils';
import { MedplumClient } from '@medplum/core';

export const bot = new Command('bot');

bot
  .command('save')
  .description('Saving the bot')
  .argument('<botName>')
  .action(async (botName) => {
    await botWrapper(medplum, botName);
  });

bot
  .command('deploy')
  .description('Deploy the app to AWS')
  .argument('<botName>')
  .action(async (botName) => {
    await botWrapper(medplum, botName, true);
  });

bot
  .command('create')
  .arguments('<botName> <projectId> <sourceFile> <distFile>')
  .description('Creating a bot')
  .action(async (botName, projectId, sourceFile, distFile) => {
    await createBot(medplum, [botName, projectId, sourceFile, distFile]);
  });

export async function botWrapper(medplum: MedplumClient, botName: string, deploy = false) {
  const botConfigs = readBotConfigs(botName);
  for (const botConfig of botConfigs) {
    const bot = await medplum.readResource('Bot', botConfig.id);
    await saveBot(medplum, botConfig, bot);
    if (deploy) {
      await deployBot(medplum, botConfig, bot);
    }
  }
}
