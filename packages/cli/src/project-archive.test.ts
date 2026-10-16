// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
  let requests: { method: string; url: string; body?: unknown }[];
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
      requests.push({ method, url, body: init.body });
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
      if (url.endsWith('/Binary/b1')) {
        return method === 'DELETE' ? json({}) : new Response(ndjson, { headers: { 'content-type': 'text/plain' } });
      }
      if (url.includes('/Binary?')) {
        return json({ resourceType: 'Binary', id: 'b2', contentType: 'application/fhir+ndjson' }, 201);
      }
      return json({ resourceType: 'OperationOutcome', issue: [] }, 404);
    });
    const medplum = new MedplumClient({ fetch, baseUrl: 'https://example.com/' });
    (createMedplumClient as Mock).mockResolvedValue(medplum);
    console.log = vi.fn();
    vi.spyOn(process.stderr, 'write').mockImplementation(vi.fn());
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  test('Archive then restore', async () => {
    await main(['node', 'index.js', 'project', 'archive', directory, '--project', 'p1', '--cleanup']);

    expect(readFileSync(join(directory, 'Patient.ndjson'), 'utf8')).toBe(ndjson);
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as Parameters;
    expect(manifest.parameter?.[1].part?.[1].valueUri).toBe('Patient.ndjson');
    expect(requests.some((r) => r.method === 'DELETE' && r.url.endsWith('/Binary/b1'))).toBe(true);

    await main(['node', 'index.js', 'project', 'restore', directory]);

    const upload = requests.find((r) => r.url.includes('/Binary?'));
    expect(Buffer.from(upload?.body as Uint8Array).toString()).toBe(ndjson);
    const restore = requests.find((r) => r.url.endsWith('/$restore'));
    const restored = JSON.parse(restore?.body as string) as Parameters;
    expect(restored.parameter?.[1].part?.[1].valueUri).toBe('Binary/b2');
    expect(console.log).toHaveBeenCalledWith('Warning: Enable bots');
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
    await expect(main(['node', 'index.js', 'project', 'archive', directory, '--project', 'p1'])).rejects.toThrow(
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
