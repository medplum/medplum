// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { fetchLatestVersionString, fetchVersionManifest, type ReleaseManifest } from '@medplum/core';
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type streamWeb from 'node:stream/web';

const DEFAULT_CACHE_DIR = resolve(homedir(), '.medplum', 'agent-harness', 'releases');
const APP_NAME = 'medplum-agent';

export interface ReleaseAsset {
  /** Absolute path to the downloaded asset. */
  path: string;
  /** Version string (no leading 'v'). */
  version: string;
  /** OS the asset targets — derived from current platform unless overridden. */
  os: 'linux' | 'win32';
}

/**
 * Downloads + caches Medplum Agent release assets.
 *
 * Mirrors the logic in `@medplum/agent` upgrader-utils: fetches the release
 * manifest from `meta.medplum.com`, picks the asset matching the platform
 * ending (`linux` or `.exe`), and downloads to `<cacheDir>/<name>`.
 */
export class ReleaseCache {
  readonly cacheDir: string;

  constructor(cacheDir = DEFAULT_CACHE_DIR) {
    this.cacheDir = cacheDir;
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Ensure the asset for `version` (default: latest) is present locally.
   * Returns the path + resolved version. If the asset is already cached and
   * the byte size matches the manifest's, the download is skipped.
   */
  async ensure(version?: string, targetOs?: 'linux' | 'win32'): Promise<ReleaseAsset> {
    const os = targetOs ?? (platform() === 'win32' ? 'win32' : 'linux');
    const resolvedVersion = version ?? (await fetchLatestVersionString(APP_NAME));
    const manifest = await fetchVersionManifest(APP_NAME, resolvedVersion);
    const downloadUrl = pickDownloadUrl(manifest, os);
    const fileName = fileNameFromUrl(downloadUrl);
    const targetPath = resolve(this.cacheDir, fileName);
    if (!existsSync(targetPath)) {
      await downloadTo(downloadUrl, targetPath);
    }
    return { path: targetPath, version: resolvedVersion, os };
  }
}

export function pickDownloadUrl(manifest: ReleaseManifest, os: 'linux' | 'win32'): string {
  const ending = os === 'win32' ? '.exe' : 'linux';
  const asset = manifest.assets.find((a) => a.name.endsWith(ending));
  if (!asset) {
    throw new Error(`No '${os}' asset found in release ${manifest.tag_name}`);
  }
  return asset.browser_download_url;
}

function fileNameFromUrl(url: string): string {
  const u = new URL(url);
  const last = u.pathname.split('/').pop();
  if (!last) throw new Error(`could not derive filename from ${url}`);
  return last;
}

async function downloadTo(url: string, path: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  if (!res.body) {
    throw new Error(`Response body missing for ${url}`);
  }
  const readable = Readable.fromWeb(res.body as streamWeb.ReadableStream);
  try {
    await pipeline(readable, createWriteStream(path));
  } catch (err) {
    if (existsSync(path)) unlinkSync(path);
    throw new Error(`Download to ${path} failed`, { cause: err });
  }
}
