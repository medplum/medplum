// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { LoginState } from '@medplum/core';
import { ContentType, MedplumClient } from '@medplum/core';
import type { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Mock } from 'vitest';
import { main } from '.';
import { createMedplumClient } from './util/client';

vi.mock('./util/client');

const ndjson = '{"resourceType":"Patient","id":"1"}\n';
const binaryId = '00000000-0000-4000-8000-000000000001';
const deletedBinaryId = '00000000-0000-4000-8000-000000000002';
const emptyBinaryId = '00000000-0000-4000-8000-000000000003';
const binaryNdjson = [
  { resourceType: 'Binary', id: binaryId, contentType: 'text/plain', meta: { versionId: 'v1' } },
  { resourceType: 'Binary', id: emptyBinaryId, contentType: 'text/plain', meta: { versionId: 'v4' } },
  { resourceType: 'Binary', id: deletedBinaryId, contentType: 'text/plain', meta: { versionId: 'v2' } },
  { resourceType: 'Binary', id: deletedBinaryId, meta: { versionId: 'v3', deleted: true } },
]
  .map((r) => JSON.stringify(r) + '\n')
  .join('');

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': ContentType.FHIR_JSON, ...headers } });
}

function accepted(jobId: string): Response {
  return json({ resourceType: 'OperationOutcome', id: 'accepted', issue: [] }, 202, {
    'content-location': `https://example.com/fhir/R4/job/${jobId}/status`,
  });
}

describe('CLI project archive and restore', () => {
  let directory: string;
  let fetch: Mock;
  let requests: { method: string; url: string; body?: unknown; headers?: unknown }[];
  let jobs: Record<string, AsyncJob>;

  beforeAll(() => {
    process.exit = vi.fn<(exitCode?: number) => never>().mockImplementation(function exit(exitCode?: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    });
  });

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'medplum-archive-'));
    requests = [];
    jobs = {
      archive: {
        resourceType: 'AsyncJob',
        status: 'completed',
        request: 'archive',
        requestTime: '2026-01-01T00:00:00Z',
        output: {
          resourceType: 'Parameters',
          parameter: [
            { name: 'project', valueReference: { reference: 'Project/p1' } },
            {
              name: 'output',
              part: [
                { name: 'type', valueCode: 'Patient' },
                { name: 'url', valueUri: 'Binary/b1' },
              ],
            },
            {
              name: 'output',
              part: [
                { name: 'type', valueCode: 'Binary' },
                { name: 'url', valueUri: 'Binary/b3' },
              ],
            },
          ],
        },
      },
      restore: {
        resourceType: 'AsyncJob',
        status: 'completed',
        request: 'restore',
        requestTime: '2026-01-01T00:00:00Z',
        output: { resourceType: 'Parameters', parameter: [{ name: 'warning', valueString: 'Enable bots' }] },
      },
    };
    fetch = vi.fn(async (url: string, init: RequestInit) => {
      const method = init.method ?? 'GET';
      requests.push({ method, url, body: init.body, headers: init.headers });
      if (url.endsWith('/Project/p1/$archive')) {
        return accepted('archive');
      }
      if (url.endsWith('/$restore')) {
        return accepted('restore');
      }
      const job = /job\/(\w+)\/status$/.exec(url)?.[1];
      if (job) {
        return json(jobs[job]);
      }
      if (url.endsWith('/$expunge')) {
        return json({ resourceType: 'OperationOutcome', issue: [] });
      }
      if (url.endsWith('/Binary/b1')) {
        return method === 'DELETE' ? json({}) : new Response(ndjson, { headers: { 'content-type': 'text/plain' } });
      }
      if (url.endsWith('/Binary/b3')) {
        return method === 'DELETE' ? json({}) : new Response(binaryNdjson);
      }
      if (url.endsWith(`/Binary/${binaryId}`)) {
        return new Response('hello');
      }
      if (url.includes(`/Binary/${binaryId}/$presigned-url?upload=true`)) {
        return json({
          resourceType: 'Parameters',
          parameter: [{ name: 'url', valueUri: 'https://storage.example.com/x' }],
        });
      }
      if (url === 'https://storage.example.com/x') {
        return new Response(null, { status: 200 });
      }
      if (url.includes('/Binary?')) {
        return json({ resourceType: 'Binary', id: 'b2', contentType: 'application/fhir+ndjson' }, 201);
      }
      return json({ resourceType: 'OperationOutcome', issue: [] }, 404);
    });
    vi.stubGlobal('fetch', fetch);
    const medplum = new MedplumClient({ fetch, baseUrl: 'https://example.com/' });
    medplum.getActiveLogin = () => ({ project: { reference: 'Project/p1' } }) as LoginState;
    (createMedplumClient as Mock).mockResolvedValue(medplum);
    console.log = vi.fn();
    vi.spyOn(process.stderr, 'write').mockImplementation(vi.fn());
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  test('Archive then restore', async () => {
    await main(['node', 'index.js', 'project', 'archive', directory, '--cleanup', '--binaries']);

    expect(readFileSync(join(directory, 'Patient.ndjson'), 'utf8')).toBe(ndjson);
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as Parameters;
    expect(manifest.parameter?.[1].part?.[1].valueUri).toBe('Patient.ndjson');
    // Cleanup expunges the server copies only after every file is downloaded
    const expunged = requests.flatMap((r, i) => (r.url.endsWith('/$expunge') ? [i] : []));
    const lastDownload = requests.findLastIndex((r) => r.url.endsWith('/Binary/b3'));
    expect(requests.filter((r) => r.url.endsWith('/$expunge')).map((r) => r.url.split('/').at(-2))).toStrictEqual([
      'b1',
      'b3',
    ]);
    expect(Math.min(...expunged)).toBeGreaterThan(lastDownload);
    // Only the current, non-deleted Binary is downloaded
    expect(readFileSync(join(directory, 'binaries', binaryId), 'utf8')).toBe('hello');
    expect(requests.some((r) => r.url.endsWith(`/Binary/${deletedBinaryId}`))).toBe(false);
    // A Binary with no stored content is skipped with a warning instead of failing the archive
    expect(console.log).toHaveBeenCalledWith('Warning: 1 Binary resources have no content on the server');

    requests = [];
    await main(['node', 'index.js', 'project', 'restore', directory, '--binaries', '--cleanup']);

    const upload = requests.find((r) => r.url.includes('/Binary?'));
    expect(await new Response(upload?.body as Blob).text()).toBe(ndjson);
    const restore = requests.find((r) => r.url.endsWith('/$restore'));
    const restored = JSON.parse(restore?.body as string) as Parameters;
    expect(restored.parameter?.[1].part?.[1].valueUri).toBe('Binary/b2');
    expect(console.log).toHaveBeenCalledWith('Warning: Enable bots');
    const put = requests.find((r) => r.url === 'https://storage.example.com/x');
    expect(put?.method).toBe('PUT');
    expect(await new Response(put?.body as Blob).text()).toBe('hello');
    expect(put?.headers).toMatchObject({ 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'text/plain' });
    // Restore cleanup expunges the uploaded archive files after the restore completes
    const restoreIndex = requests.findIndex((r) => r.url.endsWith('/$restore'));
    const expungedUploads = requests.filter((r, i) => i > restoreIndex && r.url.endsWith('/Binary/b2/$expunge'));
    expect(expungedUploads).toHaveLength(2);
  });

  test('Deploy bots', async () => {
    const bots = [
      { resourceType: 'Bot', id: '00000000-0000-4000-8000-00000000000a', name: 'ok', executableCode: {} },
      { resourceType: 'Bot', id: '00000000-0000-4000-8000-00000000000b', name: 'fails', executableCode: {} },
      { resourceType: 'Bot', id: '00000000-0000-4000-8000-00000000000c', name: 'never deployed' },
    ];
    fetch.mockImplementation(async (url: string) => {
      requests.push({ method: 'POST', url });
      return url.includes('0000000a/$deploy')
        ? json({ resourceType: 'OperationOutcome', issue: [] })
        : json(
            {
              resourceType: 'OperationOutcome',
              issue: [{ severity: 'error', code: 'invalid', details: { text: 'Bots not enabled' } }],
            },
            400
          );
    });
    writeFileSync(join(directory, 'Bot.ndjson'), bots.map((b) => JSON.stringify(b)).join('\n'));

    await expect(main(['node', 'index.js', 'project', 'deploy-bots', directory])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(requests.map((r) => r.url.split('/').slice(-2).join('/'))).toStrictEqual([
      '00000000-0000-4000-8000-00000000000a/$deploy',
      '00000000-0000-4000-8000-00000000000b/$deploy',
    ]);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Failed to deploy Bot/00000000-0000-4000-8000-00000000000b (fails): Bots not enabled')
    );
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('1 Bots failed to deploy'));
  });

  test('Failed job and unsafe manifest', async () => {
    jobs.archive = {
      ...jobs.archive,
      status: 'error',
      output: {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'outcome',
            resource: {
              resourceType: 'OperationOutcome',
              issue: [{ severity: 'error', code: 'forbidden', details: { text: 'Forbidden' } }],
            },
          },
        ],
      },
    };
    await expect(main(['node', 'index.js', 'project', 'archive', directory])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Job error: Forbidden'));

    writeFileSync(
      join(directory, 'manifest.json'),
      JSON.stringify({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'output',
            part: [
              { name: 'type', valueCode: '../secret' },
              { name: 'url', valueUri: 'x' },
            ],
          },
        ],
      })
    );
    await expect(main(['node', 'index.js', 'project', 'restore', directory])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Invalid resource type'));
  });
});
