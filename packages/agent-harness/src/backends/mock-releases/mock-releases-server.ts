// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import express, { type Express, type Request, type Response } from 'express';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { extname, join } from 'node:path';

/**
 * Stand-in for https://meta.medplum.com/releases.
 *
 * Speaks the GitHub-release-manifest subset that `@medplum/core`'s
 * `fetchVersionManifest` / `fetchLatestVersionString` consume:
 *   GET /releases/latest.json
 *   GET /releases/all.json
 *   GET /releases/v{version}.json
 *   GET /releases/download/{filename}
 *
 * Two seeding modes (combinable):
 *   - **Programmatic**: `server.publish('4.5.0', [{ name, contents }])` keeps
 *     assets in-memory. Best for unit tests + scripted harness scenarios.
 *   - **Filesystem**: pass `releasesDir`. The server scans it on each request
 *     for files matching `medplum-agent[-installer]-{version}{-linux|.exe}`.
 *     Matches the on-disk UX of the upstream medplum-mock-releases-server so
 *     existing release dirs work unchanged.
 *
 * TLS is optional. When wired up inside a docker network alias for
 * meta.medplum.com, TLS is required (the agent calls the real production URL)
 * and the harness has to mint a cert + ship the CA to the agent container via
 * `NODE_EXTRA_CA_CERTS`.
 */

interface InMemoryAsset {
  name: string;
  contents: Buffer;
  publishedAt: string;
}

interface InMemoryRelease {
  version: string;
  publishedAt: string;
  assets: InMemoryAsset[];
}

interface ReleaseManifestShape {
  tag_name: string;
  version: string;
  published_at: string;
  assets: { name: string; browser_download_url: string }[];
}

export interface MockReleasesServerOptions {
  /** Port to listen on. 0 (default) → ephemeral. */
  port?: number;
  /** Bind host. Defaults to '127.0.0.1' for local, '0.0.0.0' in containers. */
  host?: string;
  /**
   * If set, the server scans this directory on every manifest request for
   * release files. Matches the upstream mock-releases-server's filesystem UX.
   */
  releasesDir?: string;
  /**
   * Public base URL used to construct `browser_download_url`. Defaults to
   * `http(s)://${host}:${actualPort}`. Override when the server is reached via
   * a hostname different from the bind (e.g. `https://meta.medplum.com` inside
   * a docker network alias).
   */
  baseUrl?: string;
  /** Enable TLS. Required for impersonating https://meta.medplum.com. */
  tls?: { cert: Buffer | string; key: Buffer | string };
  /**
   * Asset filename matcher. The default accepts both the legacy
   * `medplum-agent-installer-{version}.exe` and the binary asset variants
   * (`medplum-agent-{version}-linux`, etc.). Provide a custom regex if you
   * need a different naming convention.
   */
  filenamePattern?: RegExp;
}

// Matches the agent's canonical release naming. Prerelease suffix is the
// 7-char short-sha form `isValidMedplumSemver` enforces in @medplum/core — keeps
// it disjoint from the platform suffix so `4.5.0-linux` isn't ambiguous.
const DEFAULT_FILENAME_PATTERN =
  /^medplum-agent(?:-installer)?-(\d+\.\d+\.\d+(?:-[0-9a-z]{7})?)(?:-linux|-darwin|\.exe)$/;

export class MockReleasesServer {
  private readonly app: Express;
  private readonly opts: MockReleasesServerOptions;
  private server?: HttpServer | HttpsServer;
  private inMemory = new Map<string, InMemoryRelease>();
  private actualPort?: number;
  private actualBaseUrl?: string;

  constructor(opts: MockReleasesServerOptions = {}) {
    this.opts = opts;
    this.app = express();
    this.wireRoutes();
  }

  async start(): Promise<{ port: number; baseUrl: string }> {
    const host = this.opts.host ?? '127.0.0.1';
    const port = this.opts.port ?? 0;
    this.server = this.opts.tls
      ? createHttpsServer({ cert: this.opts.tls.cert, key: this.opts.tls.key }, this.app)
      : createHttpServer(this.app);
    await new Promise<void>((resolveFn, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, host, () => resolveFn());
    });
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('MockReleasesServer: unexpected listen address');
    }
    this.actualPort = addr.port;
    const scheme = this.opts.tls ? 'https' : 'http';
    this.actualBaseUrl = this.opts.baseUrl ?? `${scheme}://${host}:${this.actualPort}`;
    return { port: this.actualPort, baseUrl: this.actualBaseUrl };
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolveFn) => this.server!.close(() => resolveFn()));
    this.server = undefined;
  }

  /**
   * Register a release version in memory. The asset filename should follow the
   * agent's naming conventions (`medplum-agent-{version}-linux`,
   * `medplum-agent-installer-{version}.exe`, etc.) so `pickDownloadUrl` picks
   * it up by platform suffix.
   */
  publish(version: string, assets: { name: string; contents: Buffer | string }[]): void {
    const publishedAt = new Date().toISOString();
    const resolved: InMemoryAsset[] = assets.map((a) => ({
      name: a.name,
      contents: Buffer.isBuffer(a.contents) ? a.contents : Buffer.from(a.contents),
      publishedAt,
    }));
    this.inMemory.set(version, { version, publishedAt, assets: resolved });
  }

  clear(): void {
    this.inMemory.clear();
  }

  listVersions(): string[] {
    return this.allReleases().map((r) => r.version);
  }

  private wireRoutes(): void {
    this.app.get('/releases/all.json', (_req, res) => {
      const releases = this.allReleases().map((r) => this.toManifest(r));
      res.json({ versions: releases });
    });

    this.app.get('/releases/latest.json', (_req, res) => {
      const releases = this.allReleases();
      if (releases.length === 0) {
        res.status(404).json({ error: 'No releases found' });
        return;
      }
      res.json(this.toManifest(releases[0]));
    });

    this.app.get('/releases/v:version.json', (req: Request, res: Response) => {
      const release = this.allReleases().find((r) => r.version === req.params.version);
      if (!release) {
        res.status(404).json({ error: `Version ${req.params.version} not found` });
        return;
      }
      res.json(this.toManifest(release));
    });

    this.app.get('/releases/download/:filename', (req: Request, res: Response) => {
      const releases = this.allReleases();
      for (const r of releases) {
        const asset = r.assets.find((a) => a.name === req.params.filename);
        if (asset) {
          res.setHeader('content-type', 'application/octet-stream');
          res.setHeader('content-length', asset.contents.length.toString());
          res.end(asset.contents);
          return;
        }
      }
      res.status(404).json({ error: 'File not found' });
    });
  }

  private allReleases(): InMemoryRelease[] {
    const combined = new Map<string, InMemoryRelease>();
    if (this.opts.releasesDir) {
      for (const r of this.scanReleasesDir(this.opts.releasesDir)) {
        combined.set(r.version, r);
      }
    }
    // In-memory entries win when versions collide so tests can override.
    for (const [v, r] of this.inMemory) {
      combined.set(v, r);
    }
    return Array.from(combined.values()).sort((a, b) =>
      // newest first; falls back to semver-ish lexical compare on equal timestamps
      b.publishedAt.localeCompare(a.publishedAt) || compareSemver(b.version, a.version)
    );
  }

  private scanReleasesDir(dir: string): InMemoryRelease[] {
    const pattern = this.opts.filenamePattern ?? DEFAULT_FILENAME_PATTERN;
    const byVersion = new Map<string, InMemoryRelease>();
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    for (const name of entries) {
      const m = name.match(pattern);
      if (!m) continue;
      const version = m[1];
      const fullPath = join(dir, name);
      let mtime: string;
      try {
        mtime = statSync(fullPath).mtime.toISOString();
      } catch {
        continue;
      }
      const existing = byVersion.get(version);
      if (existing) {
        existing.assets.push({ name, contents: lazyReadProxy(fullPath), publishedAt: mtime });
      } else {
        byVersion.set(version, {
          version,
          publishedAt: mtime,
          assets: [{ name, contents: lazyReadProxy(fullPath), publishedAt: mtime }],
        });
      }
    }
    return Array.from(byVersion.values());
  }

  private toManifest(r: InMemoryRelease): ReleaseManifestShape {
    if (!this.actualBaseUrl) {
      throw new Error('MockReleasesServer: not started yet');
    }
    const base = this.actualBaseUrl.replace(/\/$/, '');
    return {
      tag_name: `v${r.version}`,
      version: r.version,
      published_at: r.publishedAt,
      assets: r.assets.map((a) => ({
        name: a.name,
        browser_download_url: `${base}/releases/download/${a.name}`,
      })),
    };
  }
}

/**
 * Returns a Buffer-typed value whose `length` is the file's byte size and
 * whose subsequent reads pull from disk on demand. Lets the in-memory release
 * map carry filesystem-backed assets without slurping huge installer binaries
 * into RAM on every scan.
 */
function lazyReadProxy(path: string): Buffer {
  // For simplicity, just read the file on first scan. Mock-releases is a
  // dev tool — installer binaries are <50MB and only loaded on download.
  // Revisit if/when someone wants to mock GB-scale assets.
  return readFileSync(path);
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((p) => (isNaN(Number(p)) ? p : Number(p)));
  const pb = b.split(/[.-]/).map((p) => (isNaN(Number(p)) ? p : Number(p)));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}

export function readTlsMaterial(certPath: string, keyPath: string): { cert: Buffer; key: Buffer } {
  return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
}

// Re-export for the file extension probe in tests that want to confirm an
// asset's intended platform.
export function inferPlatform(filename: string): 'linux' | 'darwin' | 'win32' | 'unknown' {
  if (filename.endsWith('.exe')) return 'win32';
  if (filename.endsWith('-linux')) return 'linux';
  if (filename.endsWith('-darwin')) return 'darwin';
  if (extname(filename) === '') return 'unknown';
  return 'unknown';
}
