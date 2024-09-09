import { Command } from 'commander';
import { createMedplumCommand } from '../util/command';
import { describeStacksCommand } from './describe';
import { initStackCommand } from './init';
import { listStacksCommand } from './list';
import { updateAppCommand } from './update-app';
import { updateBucketPoliciesCommand } from './update-bucket-policies';
import { updateConfigCommand } from './update-config';
import { updateServerCommand } from './update-server';

export function buildAwsCommand(): Command {
  const aws = new Command('aws').description('Commands to manage AWS resources');

  aws.command('init').description('Initialize a new Medplum AWS CloudFormation stacks').action(initStackCommand);

  aws.command('list').description('List Medplum AWS CloudFormation stacks').action(listStacksCommand);

  aws
    .command('describe')
    .description('Describe a Medplum AWS CloudFormation stack by tag')
    .argument('<tag>', 'The Medplum stack tag')
    .action(describeStacksCommand);

  aws
    .command('update-config')
    .alias('deploy-config')
    .description('Update the AWS Parameter Store config values')
    .argument('<tag>', 'The Medplum stack tag')
    .option('--file [file]', 'Specifies the config file to use. If not specified, the file is based on the tag.')
    .option(
      '--dryrun',
      'Displays the operations that would be performed using the specified command without actually running them.'
    )
    .option('--yes', 'Automatically confirm the update')
    .action(updateConfigCommand);

  aws.addCommand(
    createMedplumCommand('update-server')
      .alias('deploy-server')
      .description('Update the server image')
      .argument('<tag>', 'The Medplum stack tag')
      .option('--file [file]', 'Specifies the config file to use. If not specified, the file is based on the tag.')
      .option(
        '--to-version [version]',
        'Specifies the version of the configuration to update. If not specified, the latest version is updated.'
      )
      .action(updateServerCommand)
  );

  aws
    .command('update-app')
    .alias('deploy-app')
    .description('Update the app site')
    .argument('<tag>', 'The Medplum stack tag')
    .option('--file [file]', 'Specifies the config file to use. If not specified, the file is based on the tag.')
    .option(
      '--to-version [version]',
      'Specifies the version of the configuration to update. If not specified, the latest version is updated.'
    )
    .option(
      '--dryrun',
      'Displays the operations that would be performed using the specified command without actually running them.'
    )
    .option('--tar-path [tarPath]', 'Specifies the path to the extracted tarball of the @medplum/app package.')
    .action(updateAppCommand);

  aws
    .command('update-bucket-policies')
    .description('Update S3 bucket policies')
    .argument('<tag>', 'The Medplum stack tag')
    .option('--file [file]', 'Specifies the config file to use. If not specified, the file is based on the tag.')
    .option(
      '--dryrun',
      'Displays the operations that would be performed using the specified command without actually running them.'
    )
    .action(updateBucketPoliciesCommand);

  return aws;
}
