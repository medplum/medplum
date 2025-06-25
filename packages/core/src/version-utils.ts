import { MEDPLUM_VERSION } from './client';
import { normalizeErrorString } from './outcomes';

export const MEDPLUM_RELEASES_URL = 'https://meta.medplum.com/releases';

export type ReleaseManifest = { tag_name: string; assets: { name: string; browser_download_url: string }[] };

const releaseManifests = new Map<string, ReleaseManifest>();

/**
 * Clears the locally-cached `ReleaseManifest`s for all versions.
 */
export function clearReleaseCache(): void {
  releaseManifests.clear();
}

/**
 * Asserts that a given candidate is a `ReleaseManifest`.
 * @param candidate - An object assumed to be a `ReleaseManifest`.
 */
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

/**
 * Fetches the manifest for a given Medplum release version.
 * @param appName - The name of the app to fetch the manifest for.
 * @param version - The version to fetch. If no `version` is provided, defaults to the `latest` version.
 * @param params - An optional list of key-value pairs to be appended to the URL query string.
 * @returns - The manifest for the specified or latest version.
 */
export async function fetchVersionManifest(
  appName: string,
  version?: string,
  params?: Record<string, string>
): Promise<ReleaseManifest> {
  let manifest = releaseManifests.get(version ?? 'latest');
  if (!manifest) {
    const versionTag = version ? `v${version}` : 'latest';
    const url = new URL(`${MEDPLUM_RELEASES_URL}/${versionTag}.json`);
    url.searchParams.set('a', appName);
    url.searchParams.set('c', MEDPLUM_VERSION);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    const res = await fetch(url.toString());
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

/**
 * Tests that a given version string follows the basic semver pattern of `<int>.<int>.<int>`, which is used for Medplum versions.
 *
 * @param version - A version string that should be tested for valid semver semantics.
 * @returns `true` if `version` is a valid semver version that conforms to the Medplum versioning system, otherwise `false`.
 */
export function isValidMedplumSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[0-9a-z]{7})?$/.test(version);
}

/**
 * Tests that a given version string is a valid existing Medplum release version.
 * @param appName - The name of the app to check the version for.
 * @param version - A version to be checked against the existing Medplum repo releases.
 * @returns `true` if `version` is a valid semver version that corresponds to an existing release, otherwise `false`.
 */
export async function checkIfValidMedplumVersion(appName: string, version: string): Promise<boolean> {
  if (!isValidMedplumSemver(version)) {
    return false;
  }
  try {
    await fetchVersionManifest(appName, version);
  } catch (_err) {
    return false;
  }
  return true;
}

/**
 * Fetches the latest Medplum release version string.
 * @param appName - The name of the app to fetch the latest version for.
 * @returns A version string corresponding to the latest Medplum release version.
 */
export async function fetchLatestVersionString(appName: string): Promise<string> {
  const latest = await fetchVersionManifest(appName);
  if (!latest.tag_name.startsWith('v')) {
    throw new Error(`Invalid release name found. Release tag '${latest.tag_name}' did not start with 'v'`);
  }
  return latest.tag_name.slice(1);
}

/**
 * Checks if a newer version of Medplum is available and logs a warning if so.
 * @param appName - The name of the app to check the version for.
 * @param params - An optional list of key-value pairs to be appended to the URL query string.
 */
export async function warnIfNewerVersionAvailable(appName: string, params?: Record<string, string>): Promise<void> {
  try {
    const current = MEDPLUM_VERSION.split('-')[0];
    const manifest = await fetchVersionManifest(appName, undefined, params);
    const latest = manifest.tag_name.slice(1);
    if (current !== latest) {
      console.warn(
        `A new version (v${latest}) of Medplum is available. Your current version (v${current}) may be missing important updates and bug fixes.`
      );
    }
  } catch (err) {
    console.warn(`Failed to check for newer version: ${normalizeErrorString(err)}`);
  }
}
