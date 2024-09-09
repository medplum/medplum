import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ContentType } from '@medplum/core';
import fastGlob from 'fast-glob';
import fetch from 'node-fetch';
import { createReadStream, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { readConfig, safeTarExtractor } from '../utils';
import { createInvalidation, getStackByTag, printConfigNotFound, printStackNotFound, s3Client } from './utils';

export interface UpdateAppOptions {
  file?: string;
  toVersion?: string;
  dryrun?: boolean;
  tarPath?: string;
}

/**
 * The AWS "update-app" command updates the Medplum app in a Medplum CloudFormation stack to the latest version.
 * @param tag - The Medplum stack tag.
 * @param options - The update options.
 */
export async function updateAppCommand(tag: string, options: UpdateAppOptions): Promise<void> {
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
  const appBucket = details.appBucket;
  if (!appBucket) {
    throw new Error(`App bucket not found for stack ${tag}`);
  }

  let tmpDir: string;

  if (options.tarPath) {
    tmpDir = options.tarPath;
  } else {
    const version = options?.toVersion ?? 'latest';
    tmpDir = await downloadNpmPackage('@medplum/app', version);
  }

  // Replace variables in the app
  replaceVariables(tmpDir, {
    MEDPLUM_BASE_URL: config.baseUrl as string,
    MEDPLUM_CLIENT_ID: config.clientId ?? '',
    GOOGLE_CLIENT_ID: config.googleClientId ?? '',
    RECAPTCHA_SITE_KEY: config.recaptchaSiteKey ?? '',
    MEDPLUM_REGISTER_ENABLED: config.registerEnabled ? 'true' : 'false',
  });

  // Upload the app to S3 with correct content-type and cache-control
  await uploadAppToS3(tmpDir, appBucket.PhysicalResourceId as string, options);

  // Create a CloudFront invalidation to clear any cached resources
  if (details.appDistribution?.PhysicalResourceId && !options.dryrun) {
    await createInvalidation(details.appDistribution.PhysicalResourceId);
  }

  console.log('Done');
}

/**
 * Returns NPM package metadata for a given package name.
 * See: https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#getpackageversion
 * @param packageName - The npm package name.
 * @param version - The npm package version string.
 * @returns The package.json metadata content.
 */
async function getNpmPackageMetadata(packageName: string, version: string): Promise<any> {
  const url = `https://registry.npmjs.org/${packageName}/${version}`;
  const response = await fetch(url);
  return response.json();
}

/**
 * Downloads and extracts an NPM package.
 * @param packageName - The NPM package name.
 * @param version - The NPM package version or "latest".
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
 * @param folderName - The folder name of the files.
 * @param replacements - The collection of variable placeholders and replacements.
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
 * @param fileName - The file name.
 * @param replacements - The collection of variable placeholders and replacements.
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
 * @param tmpDir - The temporary directory where the app is located.
 * @param bucketName - The destination S3 bucket name.
 * @param options - The update options.
 */
async function uploadAppToS3(tmpDir: string, bucketName: string, options: UpdateAppOptions): Promise<void> {
  // Manually iterate and upload files
  // Automatic content-type detection is not reliable on Microsoft Windows
  // So we explicitly set content-type
  const uploadPatterns: [string, string, boolean][] = [
    // Cached
    // These files generally have a hash, so they can be cached forever
    // It is important to upload them first to avoid broken references from index.html
    ['assets/**/*.css', ContentType.CSS, true],
    ['assets/**/*.css.map', ContentType.JSON, true],
    ['assets/**/*.js', ContentType.JAVASCRIPT, true],
    ['assets/**/*.js.map', ContentType.JSON, true],
    ['assets/**/*.txt', ContentType.TEXT, true],
    ['assets/**/*.ico', ContentType.FAVICON, true],
    ['img/**/*.png', ContentType.PNG, true],
    ['img/**/*.svg', ContentType.SVG, true],
    ['robots.txt', ContentType.TEXT, true],

    // Not cached
    ['index.html', ContentType.HTML, false],
  ];
  for (const uploadPattern of uploadPatterns) {
    await uploadFolderToS3({
      rootDir: tmpDir,
      bucketName,
      fileNamePattern: uploadPattern[0],
      contentType: uploadPattern[1],
      cached: uploadPattern[2],
      dryrun: options.dryrun,
    });
  }
}

/**
 * Uploads a directory of files to S3.
 * @param options - The upload options such as bucket name, content type, and cache control.
 * @param options.rootDir - The root directory of the upload.
 * @param options.bucketName - The destination bucket name.
 * @param options.fileNamePattern - The glob file pattern to upload.
 * @param options.contentType - The content type MIME type.
 * @param options.cached - True to mark as public and cached forever.
 * @param options.dryrun - True to skip the upload.
 */
async function uploadFolderToS3(options: {
  rootDir: string;
  bucketName: string;
  fileNamePattern: string;
  contentType: string;
  cached: boolean;
  dryrun?: boolean;
}): Promise<void> {
  const items = fastGlob.sync(options.fileNamePattern, { cwd: options.rootDir });
  for (const item of items) {
    await uploadFileToS3(join(options.rootDir, item), options);
  }
}

/**
 * Uploads a file to S3.
 * @param filePath - The file path.
 * @param options - The upload options such as bucket name, content type, and cache control.
 * @param options.rootDir - The root directory of the upload.
 * @param options.bucketName - The destination bucket name.
 * @param options.contentType - The content type MIME type.
 * @param options.cached - True to mark as public and cached forever.
 * @param options.dryrun - True to skip the upload.
 */
async function uploadFileToS3(
  filePath: string,
  options: {
    rootDir: string;
    bucketName: string;
    contentType: string;
    cached: boolean;
    dryrun?: boolean;
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
  if (!options.dryrun) {
    await s3Client.send(new PutObjectCommand(putObjectParams));
  }
}
