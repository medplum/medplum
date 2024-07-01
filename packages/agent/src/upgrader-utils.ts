import { normalizeErrorString } from '@medplum/core';
import { createWriteStream } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import streamWeb from 'node:stream/web';

export type ReleaseManifest = { tag_name: string; assets: { name: string; browser_download_url: string }[] };

export const UPGRADE_MANIFEST_PATH = resolve(__dirname, 'upgrade.json');
export const UPGRADER_LOG_PATH = resolve(
  __dirname,
  `upgrader-logs-${new Date().toISOString().replace(/:\s*/g, '-')}.txt`
);
export const GITHUB_RELEASES_URL = 'https://api.github.com/repos/medplum/medplum/releases';
export const RELEASES_PATH = resolve(__dirname);

const releaseManifests = new Map<string, ReleaseManifest>();

export function clearReleaseCache(): void {
  releaseManifests.clear();
}

export function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

export function assertReleaseManifest(candidate: unknown): asserts candidate is ReleaseManifest {
  const manifest = candidate as ReleaseManifest;
  if (!manifest.tag_name) {
    throw new Error('Manifest missing tag_name');
  }
  const assets = manifest.assets;
  if (!assets?.length) {
    throw new Error('Manifest missing assets list');
  }
  for (const asset of assets) {
    if (!asset.browser_download_url) {
      throw new Error('Asset missing browser download URL');
    }
    if (!asset.name) {
      throw new Error('Asset missing name');
    }
  }
}

export async function checkIfValidMedplumVersion(version: string): Promise<boolean> {
  if (!isValidSemver(version)) {
    return false;
  }
  try {
    await fetchVersionManifest(version);
  } catch (_err) {
    return false;
  }
  return true;
}

export async function fetchLatestVersionString(): Promise<string> {
  const latest = await fetchVersionManifest();
  if (!latest.tag_name.startsWith('v')) {
    throw new Error(`Invalid release name found. Release tag '${latest.tag_name}' did not start with 'v'`);
  }
  return latest.tag_name.slice(1);
}

export async function downloadRelease(version: string, path: string): Promise<void> {
  const release = await fetchVersionManifest(version);

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

/**
 * @param version - The version to fetch. If no `version` is provided, defaults to the `latest` version.
 * @returns - The manifest for the specified or latest version.
 */
export async function fetchVersionManifest(version?: string): Promise<ReleaseManifest> {
  let manifest = releaseManifests.get(version ?? 'latest');
  if (!manifest) {
    const versionTag = version ? `tags/v${version}` : 'latest';
    const res = await fetch(`${GITHUB_RELEASES_URL}/${versionTag}`);
    if (res.status !== 200) {
      let message: string | undefined;
      try {
        message = ((await res.json()) as { message: string }).message;
      } catch (err) {
        console.error(`Failed to parse message from body: ${normalizeErrorString(err)}`);
      }
      throw new Error(
        `Received status code ${res.status} while fetching manifest for version '${version ?? 'latest'}'. Message: ${message}`
      );
    }
    const response = (await res.json()) as ReleaseManifest;
    assertReleaseManifest(response);
    manifest = response;
    releaseManifests.set(version ?? 'latest', manifest);
    if (!version) {
      releaseManifests.set(manifest.tag_name.slice(1), manifest);
    }
  }
  return manifest;
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
