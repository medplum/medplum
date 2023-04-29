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
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Command } from 'commander';
import fastGlob from 'fast-glob';
import { createReadStream, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import fetch from 'node-fetch';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import { pipeline } from 'stream/promises';
import { readConfig, safeTarExtractor } from './utils';

interface MedplumStackDetails {
  stack: Stack;
  tag: string;
  ecsCluster?: StackResource;
  ecsService?: StackResource;
  appBucket?: StackResource;
  appDistribution?: StackResource;
  storageBucket?: StackResource;
}

export const aws = new Command('aws').description('Commands to manage AWS resources');
const client = new CloudFormationClient({});
const s3Client = new S3Client({});
const cloudFrontClient = new CloudFrontClient({});
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

aws
  .command('update-app')
  .description('Update the app site')
  .argument('<tag>')
  .action(async (tag) => {
    const config = readConfig(tag);
    if (!config) {
      console.log('Config not found');
      return;
    }
    const details = await getStackByTag(tag);
    if (!details) {
      console.log('Stack not found');
      return;
    }
    const appBucket = details.appBucket;
    if (!appBucket) {
      console.log('App bucket not found');
      return;
    }

    const tmpDir = await downloadNpmPackage('@medplum/app', 'latest');

    // Replace variables in the app
    replaceVariables(tmpDir, {
      MEDPLUM_BASE_URL: config.baseUrl as string,
      MEDPLUM_CLIENT_ID: config.clientId || '',
      GOOGLE_CLIENT_ID: config.googleClientId || '',
      RECAPTCHA_SITE_KEY: config.recaptchaSiteKey || '',
      MEDPLUM_REGISTER_ENABLED: config.registerEnabled ? 'true' : 'false',
    });

    // Upload the app to S3 with correct content-type and cache-control
    await uploadAppToS3(tmpDir, appBucket.PhysicalResourceId as string);

    // Create a CloudFront invalidation to clear any cached resources
    if (details.appDistribution?.PhysicalResourceId) {
      await createInvalidation(details.appDistribution.PhysicalResourceId);
    }

    console.log('Done');
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
    } else if (
      resource.ResourceType === 'AWS::CloudFront::Distribution' &&
      resource.LogicalResourceId?.startsWith('FrontEndAppDistribution')
    ) {
      result.appDistribution = resource;
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

/**
 * Returns NPM package metadata for a given package name.
 * See: https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#getpackageversion
 * @param packageName The npm package name.
 */
async function getNpmPackageMetadata(packageName: string, version: string): Promise<any> {
  const url = `https://registry.npmjs.org/${packageName}/${version}`;
  const response = await fetch(url);
  return response.json();
}

/**
 * Downloads and extracts an NPM package.
 * @param packageName The NPM package name.
 * @param version The NPM package version or "latest".
 * @returns Path to temporary directory where the package was downloaded and extracted.
 */
async function downloadNpmPackage(packageName: string, version: string): Promise<string> {
  const packageMetadata = await getNpmPackageMetadata(packageName, version);
  const tarballUrl = packageMetadata.dist.tarball as string;
  const tmpDir = mkdtempSync(join(tmpdir(), 'tarball-'));
  try {
    const response = await fetch(tarballUrl);
    const extractor = safeTarExtractor(tmpDir);
    await pipeline(response.body, extractor);
    return join(tmpDir, 'package', 'dist');
  } catch (error) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Replaces variables in all JS files in the given folder.
 * @param folderName The folder name of the files.
 * @param replacements The collection of variable placeholders and replacements.
 */
function replaceVariables(folderName: string, replacements: Record<string, string>): void {
  for (const item of readdirSync(folderName, { withFileTypes: true })) {
    const itemPath = join(folderName, item.name);
    if (item.isDirectory()) {
      replaceVariables(itemPath, replacements);
    } else if (item.isFile() && itemPath.endsWith('.js')) {
      replaceVariablesInFile(itemPath, replacements);
    }
  }
}

/**
 * Replaces variables in the JS file.
 * @param fileName The file name.
 * @param replacements The collection of variable placeholders and replacements.
 */
function replaceVariablesInFile(fileName: string, replacements: Record<string, string>): void {
  let contents = readFileSync(fileName, 'utf-8');
  for (const [placeholder, replacement] of Object.entries(replacements)) {
    contents = contents.replaceAll(`process.env.${placeholder}`, `'${replacement}'`);
  }
  writeFileSync(fileName, contents);
}

/**
 * Uploads the app to S3.
 * Ensures correct content-type and cache-control for each file.
 * @param tmpDir The temporary directory where the app is located.
 * @param bucketName The destination S3 bucket name.
 */
async function uploadAppToS3(tmpDir: string, bucketName: string): Promise<void> {
  // Manually iterate and upload files
  // Automatic content-type detection is not reliable on Microsoft Windows
  // So we explicitly set content-type
  const uploadPatterns: [string, string, boolean][] = [
    // Cached
    // These files generally have a hash, so they can be cached forever
    // It is important to upload them first to avoid broken references from index.html
    ['css/**/*.css', 'text/css', true],
    ['css/**/*.css.map', 'application/json', true],
    ['img/**/*.png', 'image/png', true],
    ['img/**/*.svg', 'image/svg+xml', true],
    ['js/**/*.js', 'application/javascript', true],
    ['js/**/*.js.map', 'application/json', true],
    ['js/**/*.txt', 'text/plain', true],
    ['favicon.ico', 'image/vnd.microsoft.icon', true],
    ['robots.txt', 'text/plain', true],
    ['workbox-*.js', 'application/javascript', true],
    ['workbox-*.js.map', 'application/json', true],

    // Not cached
    ['manifest.webmanifest', 'application/manifest+json', false],
    ['service-worker.js', 'application/javascript', false],
    ['service-worker.js.map', 'application/json', false],
    ['index.html', 'text/html', false],
  ];
  for (const uploadPattern of uploadPatterns) {
    await uploadFolderToS3({
      rootDir: tmpDir,
      bucketName,
      fileNamePattern: uploadPattern[0],
      contentType: uploadPattern[1],
      cached: uploadPattern[2],
    });
  }
}

/**
 * Uploads a directory of files to S3.
 * @param options The upload options such as bucket name, content type, and cache control.
 */
async function uploadFolderToS3(options: {
  rootDir: string;
  bucketName: string;
  fileNamePattern: string;
  contentType: string;
  cached: boolean;
}): Promise<void> {
  const items = fastGlob.sync(options.fileNamePattern, { cwd: options.rootDir });
  for (const item of items) {
    await uploadFileToS3(join(options.rootDir, item), options);
  }
}

/**
 * Uploads a file to S3.
 * @param filePath The file path.
 * @param options The upload options such as bucket name, content type, and cache control.
 */
async function uploadFileToS3(
  filePath: string,
  options: {
    rootDir: string;
    bucketName: string;
    contentType: string;
    cached: boolean;
  }
): Promise<void> {
  const fileStream = createReadStream(filePath);
  const s3Key = filePath
    .substring(options.rootDir.length + 1)
    .split(sep)
    .join('/');

  const putObjectParams = {
    Bucket: options.bucketName,
    Key: s3Key,
    Body: fileStream,
    ContentType: options.contentType,
    CacheControl: options.cached ? 'public, max-age=31536000' : 'no-cache, no-store, must-revalidate',
  };

  console.log(`Uploading ${s3Key} to ${options.bucketName}...`);
  await s3Client.send(new PutObjectCommand(putObjectParams));
}

/**
 * Creates a CloudFront invalidation to clear the cache for all files.
 * This is not strictly necessary, but it helps to ensure that the latest version of the app is served.
 * In a perfect world, every deploy is clean, and hashed resources should be cached forever.
 * However, we do not recalculate hashes after variable replacements.
 * So if variables change, we need to invalidate the cache.
 * @param distributionId The CloudFront distribution ID.
 */
async function createInvalidation(distributionId: string): Promise<void> {
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
