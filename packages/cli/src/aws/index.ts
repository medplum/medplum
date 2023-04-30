import { Command } from 'commander';
import { describeStacksCommand } from './describe';
import { listStacksCommand } from './list';
import { updateAppCommand } from './update-app';
import { updateServerCommand } from './update-server';

export const aws = new Command('aws').description('Commands to manage AWS resources');

aws.command('list').description('List Medplum AWS CloudFormation stacks').action(listStacksCommand);

aws
  .command('describe')
  .description('Describe a Medplum AWS CloudFormation stack by tag')
  .argument('<tag>')
  .action(describeStacksCommand);

aws.command('update-server').description('Update the server image').argument('<tag>').action(updateServerCommand);

aws.command('update-app').description('Update the app site').argument('<tag>').action(updateAppCommand);
