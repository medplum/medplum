// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
  if (!manifest.tag_name?.startsWith('v')) {
    throw new Error("Manifest missing valid tag_name starting with a 'v' (eg. v5.1.15)");
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
 * Fetches and parses JSON from a Medplum releases file.
 *
 * Handles the machinery common to all releases requests: building the URL, appending the
 * standard `a` (app name) and `c` (current version) query params plus any extra `params`, and
 * throwing a descriptive error on a non-200 response.
 * @param fileName - The releases file to fetch (e.g. `latest.json`, `v5.1.24.json`, `all.json`).
 * @param appName - The name of the app to fetch the releases file for.
 * @param errorContext - A human-readable clause describing the request, interpolated into the
 * thrown error message (e.g. `fetching all release versions`).
 * @param params - An optional list of key-value pairs to be appended to the URL query string.
 * @returns The parsed JSON response.
 */
async function fetchReleasesJson<T>(
  fileName: string,
  appName: string,
  errorContext: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${MEDPLUM_RELEASES_URL}/${fileName}`);
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
    throw new Error(`Received status code ${res.status} while ${errorContext}. Message: ${message}`);
  }
  return (await res.json()) as T;
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
  // When fetching `latest`, never serve from or persist to the cache. `latest` is a moving
  // target, so a cached entry would otherwise go stale until the process restarts.
  let manifest = version ? releaseManifests.get(version) : undefined;
  if (!manifest) {
    const versionTag = version ? `v${version}` : 'latest';
    const response = await fetchReleasesJson<ReleaseManifest>(
      `${versionTag}.json`,
      appName,
      `fetching manifest for version '${version ?? 'latest'}'`,
      params
    );
    assertReleaseManifest(response);
    manifest = response;
    // `tag_name` is always `v${version}`, so this key matches the `version` lookup above for
    // explicit versions, and stores the resolved concrete version (immutable) for `latest` —
    // never the `latest` alias itself, which is a moving target.
    releaseManifests.set(manifest.tag_name.slice(1), manifest);
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
 * Compares two Medplum semver version strings, ignoring any trailing commit-hash suffix.
 * @param a - The first version to compare.
 * @param b - The second version to compare.
 * @returns A negative number if `a` is older than `b`, a positive number if `a` is newer than `b`, or `0` if they resolve to the same release.
 */
export function compareVersions(a: string, b: string): number {
  const aParts = a.split('-')[0].split('.').map(Number);
  const bParts = b.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
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
 * Fetches the version strings for all published Medplum releases.
 * @param appName - The name of the app to fetch the release list for.
 * @param params - An optional list of key-value pairs to be appended to the URL query string.
 * @returns An array of version strings (without the leading `v`), sorted from newest to oldest.
 */
export async function fetchAllVersionStrings(appName: string, params?: Record<string, string>): Promise<string[]> {
  const response = await fetchReleasesJson<{ versions?: { version: string }[] }>(
    'all.json',
    appName,
    'fetching all release versions',
    params
  );
  const versions = (response.versions ?? []).map((release) => release.version).filter(isValidMedplumSemver);
  return versions.sort(compareVersions).reverse();
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
