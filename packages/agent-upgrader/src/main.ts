import { Logger, normalizeErrorString } from '@medplum/core';
import { execSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';

let osString: SupportedOs;

type ReleaseManifest = { tag_name: string; assets: { name: string; browser_download_url: string }[] };
type SupportedOs = 'windows' | 'linux';

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/medplum/medplum/releases/latest';
const RELEASES_PATH = resolve(__dirname, '../../agent');
const VERSION: string | undefined = undefined;

const globalLogger = new Logger((msg) => console.log(msg));

let releasesManifest: ReleaseManifest[] | undefined;

async function main(_argv: string[]): Promise<void> {
  if (!osString) {
    switch (platform()) {
      case 'win32':
        osString = 'windows';
        break;
      case 'linux':
        osString = 'linux';
        break;
      default:
        throw new Error(`Unsupported platform: ${platform()}`);
    }
  }

  // TODO: Remove this when Linux auto-update is supported
  if (osString === 'linux') {
    throw new Error('Auto-upgrading is not currently supported for Linux');
  }

  // NOTE: Windows past this point, for now

  // First get requested version
  let version = VERSION as string;
  if (!version) {
    try {
      version = await fetchLatestVersionString();
    } catch (err: unknown) {
      globalLogger.error(`Error while fetching the latest version: ${normalizeErrorString(err)}`);
      throw err;
    }
  }

  const binPath = getReleaseBinPath(version);

  // If release in not locally downloaded, download it first
  if (!existsSync(binPath)) {
    // Download release
    await downloadRelease(version, binPath);
  }

  try {
    // Stop service
    execSync('net stop "Medplum Agent"');
    // Run installer
    execSync(`${binPath} /S`);
  } finally {
    // Try to restart Agent service if anything goes wrong
    execSync('net start "Medplum Agent"');
  }
}

async function fetchLatestVersionString(): Promise<string> {
  const latest = (await fetchReleasesManifest())[0];
  if (!latest.tag_name.startsWith('v')) {
    throw new Error(`Invalid release name found. Release tag '${latest.tag_name}' did not start with 'v'`);
  }
  return latest.tag_name.slice(1);
}

async function downloadRelease(version: string, path: string): Promise<void> {
  const allReleases = await fetchReleasesManifest();

  // Find release in the manifest
  const release = findManifestForVersion(allReleases, version);

  // Get download url
  const downloadUrl = parseDownloadUrl(release, osString);

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

async function fetchReleasesManifest(): Promise<ReleaseManifest[]> {
  if (!releasesManifest) {
    const res = await fetch(GITHUB_RELEASES_URL);
    releasesManifest = (await res.json()) as ReleaseManifest[];
    if (!releasesManifest[0]) {
      throw new Error('No releases found for repo');
    }
  }
  return releasesManifest;
}

function findManifestForVersion(releases: ReleaseManifest[], version: string): ReleaseManifest {
  for (const release of releases) {
    if (release.tag_name.slice(1) === version) {
      return release;
    }
  }
  throw new Error(`Release not found for version ${version}`);
}

function parseDownloadUrl(release: ReleaseManifest, os: SupportedOs): string {
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

function getReleaseBinPath(version: string): string {
  let binaryName: string;
  switch (osString) {
    case 'windows':
      binaryName = `medplum-agent-installer-${version}.exe`;
      break;
    case 'linux':
      binaryName = `medplum-agent-${version}-linux`;
      break;
  }
  return resolve(RELEASES_PATH, binaryName);
}

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv).catch(console.error);
}
