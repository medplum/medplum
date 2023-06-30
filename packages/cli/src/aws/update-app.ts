import { CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import fastGlob from 'fast-glob';
import { createReadStream, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import fetch from 'node-fetch';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import { pipeline } from 'stream/promises';
import { readConfig, safeTarExtractor } from '../utils';
import { cloudFrontClient, getStackByTag, s3Client } from './utils';

/**
 * The AWS "update-app" command updates the Medplum app in a Medplum CloudFormation stack to the latest version.
 * @param tag The Medplum stack tag.
 */
export async function updateAppCommand(tag: string): Promise<void> {
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
}

/**
 * Returns NPM package metadata for a given package name.
 * See: https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#getpackageversion
 * @param packageName The npm package name.
 * @param version The npm package version string.
 * @returns The package.json metadata content.
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
    contents = contents.replaceAll(`__${placeholder}__`, replacement);
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
 * @param options.rootDir The root directory of the upload.
 * @param options.bucketName The destination bucket name.
 * @param options.fileNamePattern The glob file pattern to upload.
 * @param options.contentType The content type MIME type.
 * @param options.cached True to mark as public and cached forever.
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
 * @param options.rootDir The root directory of the upload.
 * @param options.bucketName The destination bucket name.
 * @param options.contentType The content type MIME type.
 * @param options.cached True to mark as public and cached forever.
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
