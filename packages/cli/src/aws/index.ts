import { Command } from 'commander';
import { describeStacksCommand } from './describe';
import { initStackCommand } from './init';
import { listStacksCommand } from './list';
import { updateAppCommand } from './update-app';
import { updateBucketPoliciesCommand } from './update-bucket-policies';
import { updateServerCommand } from './update-server';

export const aws = new Command('aws').description('Commands to manage AWS resources');

aws.command('init').description('Initialize a new Medplum AWS CloudFormation stacks').action(initStackCommand);

aws.command('list').description('List Medplum AWS CloudFormation stacks').action(listStacksCommand);

aws
  .command('describe')
  .description('Describe a Medplum AWS CloudFormation stack by tag')
  .argument('<tag>')
  .action(describeStacksCommand);

aws
  .command('update-server')
  .alias('deploy-server')
  .description('Update the server image')
  .argument('<tag>')
  .action(updateServerCommand);

aws
  .command('update-app')
  .alias('deploy-app')
  .description('Update the app site')
  .argument('<tag>')
  .option(
    '--dryrun',
    'Displays the operations that would be performed using the specified command without actually running them.'
  )
  .action(updateAppCommand);

aws
  .command('update-bucket-policies')
  .description('Update S3 bucket policies')
  .argument('<tag>')
  .option(
    '--dryrun',
    'Displays the operations that would be performed using the specified command without actually running them.'
  )
  .action(updateBucketPoliciesCommand);
