// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global console, process */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

// This script deploys files to an S3 bucket.
// The normal AWS CLI command to copy files to S3 does not reliably handle content type and cache control headers.
// This script uses the AWS SDK to upload files with the correct headers.

const region = 'us-east-1'; // S3 buckets for CloudFront must be in us-east-1
const s3Client = new S3Client({ region });

const mimeTypes = {
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.gif': 'image/gif',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ttf': 'font/ttf',
};

const immutableFileTypes = [
  '.js',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ttf',
  '.webp',
  '.woff2',
  '.mp4',
  '.webm',
];

const CACHE_CONTROL_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_CONTROL_NO_CACHE = 'no-cache';

async function main() {
  const [_node, _script, sourcePath, destPath] = process.argv;

  if (!sourcePath) {
    console.error('Error: Source path is required as the first argument.');
    return;
  }

  if (!destPath) {
    console.error('Error: Destination path is required as the second argument.');
    return;
  }

  const trimmedDestPath = destPath.toLowerCase().replace(/^s3:\/\//, '');
  const slashIndex = trimmedDestPath.indexOf('/');
  const s3Bucket = slashIndex === -1 ? trimmedDestPath : trimmedDestPath.substring(0, slashIndex);
  const s3KeyPrefix = slashIndex === -1 ? undefined : trimmedDestPath.substring(slashIndex + 1);
  if (!s3Bucket) {
    console.error('Error: Destination path must be in the format "s3://bucket/key-prefix".');
    return;
  }

  console.log(`Starting deployment to s3://${trimmedDestPath}/`);
  const allFiles = await getFiles(sourcePath);
  const uploadRequests = [];
  for (const filePath of allFiles) {
    const relativePath = relative(sourcePath, filePath).replace(/\\/g, '/');
    const ext = extname(relativePath).toLowerCase();
    let s3Key = '';
    if (s3KeyPrefix) {
      s3Key = `${s3KeyPrefix}/`;
    }
    if (relativePath === 'index.html') {
      // Special case for root index.html
      s3Key += 'index.html';
    } else if (relativePath.endsWith('/index.html')) {
      // Special case for directories with index.html
      s3Key += relativePath.slice(0, -'index.html'.length);
    } else if (relativePath.endsWith('.html')) {
      // Regular HTML files
      s3Key += relativePath.slice(0, -ext.length);
    } else {
      s3Key += relativePath;
    }
    const fileStream = createReadStream(filePath);
    const fileStat = await stat(filePath);
    uploadRequests.push({
      Bucket: s3Bucket,
      Key: s3Key,
      Body: fileStream,
      ContentType: mimeTypes[ext] || 'application/octet-stream',
      CacheControl: immutableFileTypes.includes(ext) ? CACHE_CONTROL_IMMUTABLE : CACHE_CONTROL_NO_CACHE,
    });
    console.log(`Prepared upload for ${relativePath} => ${s3Key} (${fileStat.size} bytes)`);
  }

  console.log('Uploading immutable files...');
  await uploadAll(uploadRequests.filter((r) => r.CacheControl === CACHE_CONTROL_IMMUTABLE));

  console.log('Uploading no-cache files...');
  await uploadAll(uploadRequests.filter((r) => r.CacheControl === CACHE_CONTROL_NO_CACHE));

  console.log('Deployment complete.');
}

async function getFiles(dir) {
  let files = [];
  const items = await readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(await getFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function uploadAll(requests) {
  const uploads = [];
  for (const request of requests) {
    const parallelUploads3 = new Upload({
      client: s3Client,
      params: request,
    });
    uploads.push(parallelUploads3.done());
  }
  await Promise.all(uploads);
}

main().catch(console.error);
