import { StackResource } from '@aws-sdk/client-cloudformation';
import { GetBucketPolicyCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import { readConfig } from '../utils';
import { createInvalidation, getStackByTag, printConfigNotFound, printStackNotFound, s3Client } from './utils';

export interface UpdateBucketPoliciesOptions {
  file?: string;
  dryrun?: boolean;
}

interface Policy {
  Version?: string;
  Statement?: PolicyStatement[];
}

interface PolicyStatement {
  Effect?: string;
  Principal?: { AWS: string };
  Action?: string | string[];
  Resource?: string | string[];
}

/**
 * The AWS "update-bucket-policies" command adds necessary policy statements to S3 bucket policy documents.
 *
 * This is necessary for Medplum deployments outside of the us-east-1 region.
 *
 * @param tag - The Medplum stack tag.
 * @param options - The update options.
 */
export async function updateBucketPoliciesCommand(tag: string, options: UpdateBucketPoliciesOptions): Promise<void> {
  const config = readConfig(tag, options);
  if (!config) {
    printConfigNotFound(tag, options);
    throw new Error(`Config not found: ${tag}`);
  }

  const details = await getStackByTag(tag);
  if (!details) {
    await printStackNotFound(tag);
    throw new Error(`Stack not found: ${tag}`);
  }

  await updateBucketPolicy('App', details.appBucket, details.appDistribution, details.appOriginAccessIdentity, options);

  await updateBucketPolicy(
    'Storage',
    details.storageBucket,
    details.storageDistribution,
    details.storageOriginAccessIdentity,
    options
  );

  console.log('Done');
}

export async function updateBucketPolicy(
  friendlyName: string,
  bucketResource: StackResource | undefined,
  distributionResource: StackResource | undefined,
  oaiResource: StackResource | undefined,
  options: UpdateBucketPoliciesOptions
): Promise<void> {
  if (!bucketResource?.PhysicalResourceId) {
    throw new Error(`${friendlyName} bucket not found`);
  }

  if (!distributionResource?.PhysicalResourceId) {
    throw new Error(`${friendlyName} distribution not found`);
  }

  if (!oaiResource?.PhysicalResourceId) {
    throw new Error(`${friendlyName} OAI not found`);
  }

  const bucketName = bucketResource.PhysicalResourceId;
  const oaiId = oaiResource.PhysicalResourceId;
  const bucketPolicy = await getPolicy(bucketName);
  if (policyHasStatement(bucketPolicy, bucketName, oaiId)) {
    throw new Error(`${friendlyName} bucket already has policy statement`);
  }

  addPolicyStatement(bucketPolicy, bucketName, oaiId);
  console.log(`${friendlyName} bucket policy:`);
  console.log(JSON.stringify(bucketPolicy, undefined, 2));

  if (options.dryrun) {
    console.log('Dry run - skipping updates');
  } else {
    // Apply the updated policy
    console.log('Updating bucket policy...');
    await setPolicy(bucketName, bucketPolicy);
    console.log('Bucket policy updated');

    // Create a CloudFront invalidation to clear any cached responses
    console.log('Creating CloudFront invalidation...');
    await createInvalidation(distributionResource.PhysicalResourceId);
    console.log('CloudFront invalidation created');

    console.log(`${friendlyName} bucket policy updated`);
  }
}

async function getPolicy(bucketName: string): Promise<Policy> {
  const policyResponse = await s3Client.send(
    new GetBucketPolicyCommand({
      Bucket: bucketName,
    })
  );
  return JSON.parse(policyResponse.Policy ?? '{}') as Policy;
}

async function setPolicy(bucketName: string, policy: Policy): Promise<void> {
  await s3Client.send(
    new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(policy),
    })
  );
}

function policyHasStatement(policy: Policy, bucketName: string, oaiId: string): boolean {
  return !!policy?.Statement?.some((s: PolicyStatement) => {
    return (
      s?.Effect === 'Allow' &&
      s?.Principal?.AWS === `arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${oaiId}` &&
      Array.isArray(s?.Action) &&
      s?.Action?.includes('s3:GetObject*') &&
      s?.Action?.includes('s3:GetBucket*') &&
      s?.Action?.includes('s3:List*') &&
      Array.isArray(s?.Resource) &&
      s?.Resource?.includes(`arn:aws:s3:::${bucketName}`) &&
      s?.Resource?.includes(`arn:aws:s3:::${bucketName}/*`)
    );
  });
}

function addPolicyStatement(policy: Policy, bucketName: string, oaiId: string): void {
  if (!policy.Version) {
    policy.Version = '2012-10-17';
  }

  if (!policy.Statement) {
    policy.Statement = [];
  }

  policy.Statement.push({
    Effect: 'Allow',
    Principal: {
      AWS: `arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${oaiId}`,
    },
    Action: ['s3:GetObject*', 's3:GetBucket*', 's3:List*'],
    Resource: [`arn:aws:s3:::${bucketName}`, `arn:aws:s3:::${bucketName}/*`],
  });
}
