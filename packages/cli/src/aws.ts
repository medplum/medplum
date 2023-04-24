import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
  Stack,
  StackResource,
  StackSummary,
} from '@aws-sdk/client-cloudformation';
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { Command } from 'commander';

interface MedplumStackDetails {
  stack: Stack;
  tag: string;
  ecsCluster?: StackResource;
  ecsService?: StackResource;
  appBucket?: StackResource;
  storageBucket?: StackResource;
}

export const aws = new Command('aws').description('Commands to manage AWS resources');
const client = new CloudFormationClient({});
const tagKey = 'medplum:environment';

aws
  .command('list')
  .description('List Medplum AWS CloudFormation stacks')
  .action(async () => {
    const stackSummaries = await listStacks();
    for (const stackSummary of stackSummaries) {
      const stackName = stackSummary.StackName;
      const details = await getStackDetails(stackName);
      if (!details) {
        continue;
      }
      printStackDetails(details);
      console.log('');
    }
  });

aws
  .command('describe')
  .description('Describe a Medplum AWS CloudFormation stack by tag')
  .argument('<tag>')
  .action(async (tag) => {
    const details = await getStackByTag(tag);
    if (!details) {
      console.log('Stack not found');
      return;
    }
    printStackDetails(details);
  });

aws
  .command('update-server')
  .description('Update the server image')
  .argument('<tag>')
  .action(async (tag) => {
    const details = await getStackByTag(tag);
    if (!details) {
      console.log('Stack not found');
      return;
    }
    const ecsCluster = details.ecsCluster?.PhysicalResourceId;
    if (!ecsCluster) {
      console.log('ECS Cluster not found');
      return;
    }
    const ecsService = getEcsServiceName(details.ecsService);
    if (!ecsService) {
      console.log('ECS Service not found');
      return;
    }
    const client = new ECSClient({});
    await client.send(
      new UpdateServiceCommand({
        cluster: ecsCluster,
        service: ecsService,
        forceNewDeployment: true,
      })
    );
    console.log(`Service "${ecsService}" updated successfully.`);
  });

async function listStacks(): Promise<(StackSummary & { StackName: string })[]> {
  const listResult = await client.send(new ListStacksCommand({}));
  return (
    (listResult.StackSummaries?.filter((s) => s.StackName && s.StackStatus !== 'DELETE_COMPLETE') as (StackSummary & {
      StackName: string;
    })[]) || []
  );
}

async function getStackByTag(tag: string): Promise<MedplumStackDetails | undefined> {
  const stackSummaries = await listStacks();
  for (const stackSummary of stackSummaries) {
    const stackName = stackSummary.StackName;
    const details = await getStackDetails(stackName);
    if (details?.tag === tag) {
      return details;
    }
  }
  return undefined;
}

async function getStackDetails(stackName: string): Promise<MedplumStackDetails | undefined> {
  const describeStacksCommand = new DescribeStacksCommand({ StackName: stackName });
  const stackDetails = await client.send(describeStacksCommand);
  const stack = stackDetails.Stacks && stackDetails.Stacks[0];
  const medplumTag = stack?.Tags?.find((tag) => tag.Key === tagKey);
  if (!medplumTag) {
    return undefined;
  }

  const stackResources = await client.send(new DescribeStackResourcesCommand({ StackName: stackName }));
  if (!stackResources.StackResources) {
    return undefined;
  }

  const result: MedplumStackDetails = {
    stack: stack as Stack,
    tag: medplumTag.Value as string,
  };

  for (const resource of stackResources.StackResources) {
    if (resource.ResourceType === 'AWS::ECS::Cluster') {
      result.ecsCluster = resource;
    } else if (resource.ResourceType === 'AWS::ECS::Service') {
      result.ecsService = resource;
    } else if (
      resource.ResourceType === 'AWS::S3::Bucket' &&
      resource.LogicalResourceId?.startsWith('FrontEndAppBucket')
    ) {
      result.appBucket = resource;
    } else if (
      resource.ResourceType === 'AWS::S3::Bucket' &&
      resource.LogicalResourceId?.startsWith('StorageStorageBucket')
    ) {
      result.storageBucket = resource;
    }
  }

  return result;
}

function printStackDetails(details: MedplumStackDetails): void {
  console.log(`Medplum Tag:     ${details.tag}`);
  console.log(`Stack Name:      ${details.stack.StackName}`);
  console.log(`Stack ID:        ${details.stack.StackId}`);
  console.log(`Status:          ${details.stack.StackStatus}`);
  console.log(`ECS Cluster:     ${details.ecsCluster?.PhysicalResourceId}`);
  console.log(`ECS Service:     ${getEcsServiceName(details.ecsService)}`);
  console.log(`App Bucket:      ${details.appBucket?.PhysicalResourceId}`);
  console.log(`Storage Bucket:  ${details.storageBucket?.PhysicalResourceId}`);
}

function getEcsServiceName(resource: StackResource | undefined): string | undefined {
  return resource?.PhysicalResourceId?.split('/')?.pop() || '';
}
