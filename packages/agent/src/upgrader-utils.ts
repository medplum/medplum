import { createWriteStream } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';

export type ReleaseManifest = { tag_name: string; assets: { name: string; browser_download_url: string }[] };
export type SupportedOs = 'windows' | 'linux';

let _osString: SupportedOs;

export const UPGRADE_MANIFEST_PATH = resolve(__dirname, 'upgrade.json');
export const GITHUB_RELEASES_URL = 'https://api.github.com/repos/medplum/medplum/releases';
export const RELEASES_PATH = resolve(__dirname);

const releaseManifests = new Map<string, ReleaseManifest>();

export function getOsString(): SupportedOs {
  if (!_osString) {
    switch (platform()) {
      case 'win32':
        _osString = 'windows';
        break;
      case 'linux':
        _osString = 'linux';
        break;
      default:
        throw new Error(`Unsupported platform: ${platform()}`);
    }
  }
  return _osString;
}

export function isValidSemver(version: string): boolean {
  return /\d+\.\d+\.\d+/.test(version);
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
  const downloadUrl = parseDownloadUrl(release, getOsString());

  // Write file to RELEASE_INSTALLER_FOLDER
  const { body } = await fetch(downloadUrl);
  if (!body) {
    throw new Error('Body not present on Response');
  }

  // @ts-expect-error Slight type mismatch
  const readable = Readable.fromWeb(body);
  const writeStream = readable.pipe(createWriteStream(path));

  return new Promise<void>((resolve) => {
    writeStream.once('close', resolve);
  });
}

/**
 * @param version - The version to fetch. If no `version` is provided, defaults to the `latest` version.
 * @returns - The manifest for the specified or latest version.
 */
async function fetchVersionManifest(version?: string): Promise<ReleaseManifest> {
  let manifest = releaseManifests.get(version ?? 'latest');
  if (!manifest) {
    const res = await fetch(`${GITHUB_RELEASES_URL}/${version ? `tags/v${version}` : 'latest'}`);
    manifest = (await res.json()) as ReleaseManifest;
    if (!manifest) {
      throw new Error(version ? `No release found with tag v${version}` : 'No releases found in repo');
    }
    releaseManifests.set(version ?? 'latest', manifest);
  }
  return manifest;
}

export function parseDownloadUrl(release: ReleaseManifest, os: SupportedOs): string {
  let endingToMatch: string;
  switch (os) {
    case 'windows':
      endingToMatch = '.exe';
      break;
    case 'linux':
      endingToMatch = 'linux';
      break;
    default:
      throw new Error('Invalid OS');
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
  switch (getOsString()) {
    case 'windows':
      binaryName = `medplum-agent-installer-${version}.exe`;
      break;
    case 'linux':
      binaryName = `medplum-agent-${version}-linux`;
      break;
  }
  return resolve(RELEASES_PATH, binaryName);
}
