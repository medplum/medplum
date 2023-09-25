import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
  Stack,
  StackResource,
  StackSummary,
} from '@aws-sdk/client-cloudformation';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { ECSClient } from '@aws-sdk/client-ecs';
import { S3Client } from '@aws-sdk/client-s3';

export interface MedplumStackDetails {
  stack: Stack;
  tag: string;
  ecsCluster?: StackResource;
  ecsService?: StackResource;
  appBucket?: StackResource;
  appDistribution?: StackResource;
  appOriginAccessIdentity?: StackResource;
  storageBucket?: StackResource;
  storageDistribution?: StackResource;
  storageOriginAccessIdentity?: StackResource;
}

export const cloudFormationClient = new CloudFormationClient({});
export const cloudFrontClient = new CloudFrontClient({ region: 'us-east-1' });
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
  const result = {} as Partial<MedplumStackDetails>;
  await buildStackDetails(cloudFormationClient, stackName, result);
  if (cloudFormationClient.config.region !== 'us-east-1') {
    await buildStackDetails(new CloudFormationClient({ region: 'us-east-1' }), stackName + '-us-east-1', result);
  }
  return result as MedplumStackDetails;
}

/**
 * Builds the Medplum stack details for the given stack name and region.
 * @param client The CloudFormation client.
 * @param stackName The CloudFormation stack name.
 * @param result The Medplum stack details builder.
 */
async function buildStackDetails(
  client: CloudFormationClient,
  stackName: string,
  result: Partial<MedplumStackDetails>
): Promise<void> {
  const describeStacksCommand = new DescribeStacksCommand({ StackName: stackName });
  const stackDetails = await client.send(describeStacksCommand);
  const stack = stackDetails?.Stacks?.[0];
  const medplumTag = stack?.Tags?.find((tag) => tag.Key === tagKey);
  if (!medplumTag) {
    return;
  }

  const stackResources = await client.send(new DescribeStackResourcesCommand({ StackName: stackName }));
  if (!stackResources.StackResources) {
    return;
  }

  if (client === cloudFormationClient) {
    result.stack = stack;
    result.tag = medplumTag.Value as string;
  }

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
      resource.ResourceType === 'AWS::CloudFront::Distribution' &&
      resource.LogicalResourceId?.startsWith('FrontEndAppDistribution')
    ) {
      result.appDistribution = resource;
    } else if (
      resource.ResourceType === 'AWS::CloudFront::CloudFrontOriginAccessIdentity' &&
      resource.LogicalResourceId?.startsWith('FrontEndOriginAccessIdentity')
    ) {
      result.appOriginAccessIdentity = resource;
    } else if (
      resource.ResourceType === 'AWS::S3::Bucket' &&
      resource.LogicalResourceId?.startsWith('StorageStorageBucket')
    ) {
      result.storageBucket = resource;
    } else if (
      resource.ResourceType === 'AWS::CloudFront::Distribution' &&
      resource.LogicalResourceId?.startsWith('StorageStorageDistribution')
    ) {
      result.storageDistribution = resource;
    } else if (
      resource.ResourceType === 'AWS::CloudFront::CloudFrontOriginAccessIdentity' &&
      resource.LogicalResourceId?.startsWith('StorageOriginAccessIdentity')
    ) {
      result.storageOriginAccessIdentity = resource;
    }
  }
}

/**
 * Prints the given Medplum stack details to stdout.
 * @param details The Medplum stack details.
 */
export function printStackDetails(details: MedplumStackDetails): void {
  console.log(`Medplum Tag:           ${details.tag}`);
  console.log(`Stack Name:            ${details.stack?.StackName}`);
  console.log(`Stack ID:              ${details.stack?.StackId}`);
  console.log(`Status:                ${details.stack?.StackStatus}`);
  console.log(`ECS Cluster:           ${details.ecsCluster?.PhysicalResourceId}`);
  console.log(`ECS Service:           ${getEcsServiceName(details.ecsService)}`);
  console.log(`App Bucket:            ${details.appBucket?.PhysicalResourceId}`);
  console.log(`App Distribution:      ${details.appDistribution?.PhysicalResourceId}`);
  console.log(`App OAI:               ${details.appOriginAccessIdentity?.PhysicalResourceId}`);
  console.log(`Storage Bucket:        ${details.storageBucket?.PhysicalResourceId}`);
  console.log(`Storage Distribution:  ${details.storageDistribution?.PhysicalResourceId}`);
  console.log(`Storage OAI:           ${details.storageOriginAccessIdentity?.PhysicalResourceId}`);
}

/**
 * Parses the ECS service name from the given AWS ECS service resource.
 * @param resource The AWS ECS service resource.
 * @returns The ECS service name.
 */
export function getEcsServiceName(resource: StackResource | undefined): string | undefined {
  return resource?.PhysicalResourceId?.split('/')?.pop() || '';
}

/**
 * Creates a CloudFront invalidation to clear the cache for all files.
 * This is not strictly necessary, but it helps to ensure that the latest version of the app is served.
 * In a perfect world, every deploy is clean, and hashed resources should be cached forever.
 * However, we do not recalculate hashes after variable replacements.
 * So if variables change, we need to invalidate the cache.
 * @param distributionId The CloudFront distribution ID.
 */
export async function createInvalidation(distributionId: string): Promise<void> {
  const response = await cloudFrontClient.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `invalidate-all-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ['/*'],
        },
      },
    })
  );
  console.log(`Created invalidation with ID: ${response.Invalidation?.Id}`);
}
