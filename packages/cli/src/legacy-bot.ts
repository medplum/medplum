import { Command } from 'commander';
import { medplum } from '.';
import { botWrapper } from './bots';
import { createBot } from './utils';

// Commands to deprecate
export const saveBotDeprecate = new Command('save-bot');
export const deployBotDeprecate = new Command('deploy-bot');
export const createBotDeprecate = new Command('create-bot');

saveBotDeprecate
  .description('Saves the bot')
  .argument('<botName>')
  .action(async (botName) => {
    await botWrapper(medplum, botName);
  });

deployBotDeprecate
  .description('Deploy the app to AWS')
  .argument('<botName>')
  .action(async (botName) => {
    await botWrapper(medplum, botName, true);
  });

createBotDeprecate
  .command('create')
  .arguments('<botName> <projectId> <sourceFile> <distFile>')
  .description('Creating a bot')
  .action(async (botName, projectId, sourceFile, distFile) => {
    await createBot(medplum, [botName, projectId, sourceFile, distFile]);
  });

  