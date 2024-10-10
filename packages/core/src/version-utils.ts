import { normalizeErrorString } from './outcomes';

export const GITHUB_RELEASES_URL = 'https://api.github.com/repos/medplum/medplum/releases';

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

/**
 * Tests that a given version string follows the basic semver pattern of `<int>.<int>.<int>`, which is used for Medplum versions.
 *
 * @param version - A version string that should be tested for valid semver semantics.
 * @returns `true` if `version` is a valid semver version that conforms to the Medplum versioning system, otherwise `false`.
 */
export function isValidMedplumSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * Tests that a given version string is a valid existing Medplum release version.
 * @param version - A version to be checked against the existing Medplum repo releases.
 * @returns `true` if `version` is a valid semver version that corresponds to an existing release, otherwise `false`.
 */
export async function checkIfValidMedplumVersion(version: string): Promise<boolean> {
  if (!isValidMedplumSemver(version)) {
    return false;
  }
  try {
    await fetchVersionManifest(version);
  } catch (_err) {
    return false;
  }
  return true;
}

/**
 * @returns A version string corresponding to the latest Medplum release version.
 */
export async function fetchLatestVersionString(): Promise<string> {
  const latest = await fetchVersionManifest();
  if (!latest.tag_name.startsWith('v')) {
    throw new Error(`Invalid release name found. Release tag '${latest.tag_name}' did not start with 'v'`);
  }
  return latest.tag_name.slice(1);
}
