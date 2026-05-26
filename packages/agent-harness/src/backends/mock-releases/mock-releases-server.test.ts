// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent, fetch as undiciFetch } from 'undici';
import { MockReleasesServer } from './mock-releases-server';

describe('MockReleasesServer', () => {
  let server: MockReleasesServer;
  let baseUrl: string;

  beforeEach(async () => {
    server = new MockReleasesServer();
    const started = await server.start();
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('returns 404 from latest.json when no releases are published', async () => {
    const res = await fetch(`${baseUrl}/releases/latest.json`);
    expect(res.status).toBe(404);
  });

  it('publishes a version and serves it via latest.json + v{v}.json + all.json', async () => {
    server.publish('4.5.0', [
      { name: 'medplum-agent-4.5.0-linux', contents: Buffer.from('LINUX-4.5.0') },
    ]);

    const latest = (await (await fetch(`${baseUrl}/releases/latest.json`)).json()) as {
      tag_name: string;
      version: string;
      assets: { name: string; browser_download_url: string }[];
    };
    expect(latest.tag_name).toBe('v4.5.0');
    expect(latest.version).toBe('4.5.0');
    expect(latest.assets).toHaveLength(1);
    expect(latest.assets[0].name).toBe('medplum-agent-4.5.0-linux');
    expect(latest.assets[0].browser_download_url).toBe(
      `${baseUrl}/releases/download/medplum-agent-4.5.0-linux`
    );

    const byVersion = await fetch(`${baseUrl}/releases/v4.5.0.json`);
    expect(byVersion.status).toBe(200);

    const all = (await (await fetch(`${baseUrl}/releases/all.json`)).json()) as { versions: unknown[] };
    expect(all.versions).toHaveLength(1);

    const missing = await fetch(`${baseUrl}/releases/v0.0.1.json`);
    expect(missing.status).toBe(404);
  });

  it('sorts releases newest-first in all.json and surfaces the newest as latest', async () => {
    server.publish('4.5.0', [{ name: 'medplum-agent-4.5.0-linux', contents: Buffer.from('a') }]);
    // Force ordering by mutating publishedAt via the in-memory map indirectly — publish() stamps Date.now(),
    // so a small sleep guarantees ordering on systems with ms-resolution timestamps.
    await new Promise((r) => setTimeout(r, 5));
    server.publish('4.6.0', [{ name: 'medplum-agent-4.6.0-linux', contents: Buffer.from('b') }]);

    const latest = (await (await fetch(`${baseUrl}/releases/latest.json`)).json()) as { version: string };
    expect(latest.version).toBe('4.6.0');

    const all = (await (await fetch(`${baseUrl}/releases/all.json`)).json()) as {
      versions: { version: string }[];
    };
    expect(all.versions.map((v) => v.version)).toEqual(['4.6.0', '4.5.0']);
  });

  it('serves asset bytes from the download endpoint', async () => {
    server.publish('4.5.0', [{ name: 'medplum-agent-4.5.0-linux', contents: Buffer.from('hello world') }]);
    const res = await fetch(`${baseUrl}/releases/download/medplum-agent-4.5.0-linux`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString('utf8')).toBe('hello world');
  });

  it('returns 404 for an unknown download filename', async () => {
    const res = await fetch(`${baseUrl}/releases/download/nope.bin`);
    expect(res.status).toBe(404);
  });

  it('clear() and listVersions() manage in-memory state', async () => {
    server.publish('4.5.0', [{ name: 'medplum-agent-4.5.0-linux', contents: Buffer.from('a') }]);
    server.publish('4.6.0', [{ name: 'medplum-agent-4.6.0-linux', contents: Buffer.from('b') }]);
    expect(server.listVersions().sort()).toEqual(['4.5.0', '4.6.0']);
    server.clear();
    expect(server.listVersions()).toEqual([]);
  });
});

describe('MockReleasesServer (filesystem mode)', () => {
  let dir: string;
  let server: MockReleasesServer;
  let baseUrl: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mock-releases-test-'));
    writeFileSync(join(dir, 'medplum-agent-4.5.0-linux'), Buffer.from('LINUX-4.5.0'));
    writeFileSync(join(dir, 'medplum-agent-installer-4.5.0.exe'), Buffer.from('WIN-4.5.0'));
    writeFileSync(join(dir, 'README.md'), 'ignored');
    server = new MockReleasesServer({ releasesDir: dir });
    const started = await server.start();
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('discovers linux + windows assets and groups them by version', async () => {
    const latest = (await (await fetch(`${baseUrl}/releases/latest.json`)).json()) as {
      version: string;
      assets: { name: string }[];
    };
    expect(latest.version).toBe('4.5.0');
    const names = latest.assets.map((a) => a.name).sort();
    expect(names).toEqual(['medplum-agent-4.5.0-linux', 'medplum-agent-installer-4.5.0.exe']);
  });

  it('serves bytes from disk via the download endpoint', async () => {
    const res = await fetch(`${baseUrl}/releases/download/medplum-agent-4.5.0-linux`);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString('utf8')).toBe('LINUX-4.5.0');
  });
});

describe('MockReleasesServer (TLS)', () => {
  const opensslAvailable = (() => {
    try {
      execSync('openssl version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  // Self-signed cert generation needs openssl on the host. Skip gracefully
  // elsewhere — the docker smoke test covers TLS end-to-end anyway.
  (opensslAvailable ? it : it.skip)(
    'serves https with a self-signed cert that fetch can verify when the CA is trusted',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'mock-releases-tls-'));
      try {
        execSync(
          `openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
             -keyout ${dir}/server.key -out ${dir}/server.crt \
             -subj "/CN=localhost" \
             -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
          { stdio: 'ignore' }
        );
      } catch (err) {
        // Some openssl builds don't support -addext; fall back to a CN-only cert.
        execSync(
          `openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
             -keyout ${dir}/server.key -out ${dir}/server.crt \
             -subj "/CN=localhost"`,
          { stdio: 'ignore' }
        );
      }
      const server = new MockReleasesServer({
        tls: {
          cert: readFileSync(join(dir, 'server.crt')),
          key: readFileSync(join(dir, 'server.key')),
        },
      });
      const { baseUrl } = await server.start();
      try {
        server.publish('4.5.0', [{ name: 'medplum-agent-4.5.0-linux', contents: Buffer.from('x') }]);
        // Use undici with a CA-pinned dispatcher so we exercise real TLS
        // verification (and prove the cert chain is valid) instead of
        // disabling verification.
        const dispatcher = new Agent({
          connect: { ca: readFileSync(join(dir, 'server.crt')) },
        });
        const res = await undiciFetch(`${baseUrl}/releases/latest.json`, { dispatcher });
        expect(res.status).toBe(200);
        const json = (await res.json()) as { version: string };
        expect(json.version).toBe('4.5.0');
        await dispatcher.close();
      } finally {
        await server.stop();
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});
