import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
  Stack,
  StackResource,
  StackSummary,
} from '@aws-sdk/client-cloudformation';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { ECSClient } from '@aws-sdk/client-ecs';
import { S3Client } from '@aws-sdk/client-s3';

export interface MedplumStackDetails {
  stack: Stack;
  tag: string;
  ecsCluster?: StackResource;
  ecsService?: StackResource;
  appBucket?: StackResource;
  appDistribution?: StackResource;
  storageBucket?: StackResource;
}

export const cloudFormationClient = new CloudFormationClient({});
export const cloudFrontClient = new CloudFrontClient({});
export const ecsClient = new ECSClient({});
export const s3Client = new S3Client({});
export const tagKey = 'medplum:environment';

/**
 * Returns a list of all AWS CloudFormation stacks (both Medplum and non-Medplum).
 * @returns List of AWS CloudFormation stacks.
 */
export async function getAllStacks(): Promise<(StackSummary & { StackName: string })[]> {
  const listResult = await cloudFormationClient.send(new ListStacksCommand({}));
  return (
    (listResult.StackSummaries?.filter((s) => s.StackName && s.StackStatus !== 'DELETE_COMPLETE') as (StackSummary & {
      StackName: string;
    })[]) || []
  );
}

/**
 * Returns Medplum stack details for the given tag.
 * @param tag The Medplum stack tag.
 * @returns The Medplum stack details.
 */
export async function getStackByTag(tag: string): Promise<MedplumStackDetails | undefined> {
  const stackSummaries = await getAllStacks();
  for (const stackSummary of stackSummaries) {
    const stackName = stackSummary.StackName;
    const details = await getStackDetails(stackName);
    if (details?.tag === tag) {
      return details;
    }
  }
  return undefined;
}

/**
 * Returns Medplum stack details for the given stack name.
 * @param stackName The CloudFormation stack name.
 * @returns The Medplum stack details.
 */
export async function getStackDetails(stackName: string): Promise<MedplumStackDetails | undefined> {
  const describeStacksCommand = new DescribeStacksCommand({ StackName: stackName });
  const stackDetails = await cloudFormationClient.send(describeStacksCommand);
  const stack = stackDetails?.Stacks?.[0];
  const medplumTag = stack?.Tags?.find((tag) => tag.Key === tagKey);
  if (!medplumTag) {
    return undefined;
  }

  const stackResources = await cloudFormationClient.send(new DescribeStackResourcesCommand({ StackName: stackName }));
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
    } else if (
      resource.ResourceType === 'AWS::CloudFront::Distribution' &&
      resource.LogicalResourceId?.startsWith('FrontEndAppDistribution')
    ) {
      result.appDistribution = resource;
    }
  }

  return result;
}

/**
 * Prints the given Medplum stack details to stdout.
 * @param details The Medplum stack details.
 */
export function printStackDetails(details: MedplumStackDetails): void {
  console.log(`Medplum Tag:     ${details.tag}`);
  console.log(`Stack Name:      ${details.stack.StackName}`);
  console.log(`Stack ID:        ${details.stack.StackId}`);
  console.log(`Status:          ${details.stack.StackStatus}`);
  console.log(`ECS Cluster:     ${details.ecsCluster?.PhysicalResourceId}`);
  console.log(`ECS Service:     ${getEcsServiceName(details.ecsService)}`);
  console.log(`App Bucket:      ${details.appBucket?.PhysicalResourceId}`);
  console.log(`Storage Bucket:  ${details.storageBucket?.PhysicalResourceId}`);
}

/**
 * Parses the ECS service name from the given AWS ECS service resource.
 * @param resource The AWS ECS service resource.
 * @returns The ECS service name.
 */
export function getEcsServiceName(resource: StackResource | undefined): string | undefined {
  return resource?.PhysicalResourceId?.split('/')?.pop() || '';
}
