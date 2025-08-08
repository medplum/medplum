// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { fetchVersionManifest, ReleaseManifest } from '@medplum/core';
import { createWriteStream } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import streamWeb from 'node:stream/web';

export const UPGRADE_MANIFEST_PATH = resolve(__dirname, 'upgrade.json');
export const UPGRADER_LOG_PATH = resolve(
  __dirname,
  `upgrader-logs-${new Date().toISOString().replace(/:\s*/g, '-')}.txt`
);
export const RELEASES_PATH = resolve(__dirname);

export async function downloadRelease(version: string, path: string): Promise<void> {
  const release = await fetchVersionManifest('agent-upgrader', version);

  // Get download url
  const downloadUrl = parseDownloadUrl(release, platform());

  // Write file to RELEASE_INSTALLER_FOLDER
  const { body } = await fetch(downloadUrl);
  if (!body) {
    throw new Error('Body not present on Response');
  }

  const readable = Readable.fromWeb(body as streamWeb.ReadableStream);
  const writeStream = readable.pipe(createWriteStream(path));

  return new Promise<void>((resolve) => {
    writeStream.once('close', resolve);
  });
}

export function parseDownloadUrl(release: ReleaseManifest, os: ReturnType<typeof platform>): string {
  let endingToMatch: string;
  switch (os) {
    case 'win32':
      endingToMatch = '.exe';
      break;
    case 'linux':
      endingToMatch = 'linux';
      break;
    default:
      throw new Error(`Unsupported platform: ${os}`);
  }
  for (const asset of release.assets) {
    if (asset.name.endsWith(endingToMatch)) {
      return asset.browser_download_url;
    }
  }
  throw new Error(`No download URL found for release '${release.tag_name}' for ${os}`);
}

export function getReleaseBinPath(version: string): string {
  let binaryName: string;
  switch (platform()) {
    case 'win32':
      binaryName = `medplum-agent-installer-${version}.exe`;
      break;
    case 'linux':
      binaryName = `medplum-agent-${version}-linux`;
      break;
    default:
      throw new Error(`Unsupported platform: ${platform()}`);
  }
  return resolve(RELEASES_PATH, binaryName);
}
