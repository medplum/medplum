// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { getReferenceString, normalizeErrorString, resolveId } from '@medplum/core';
import type { AsyncJob, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { createMedplumClient } from './util/client';
import { MedplumCommand } from './utils';

const NDJSON_CONTENT_TYPE = 'application/fhir+ndjson';
const MANIFEST_FILE = 'manifest.json';
const POLL_PERIOD_MS = 2000;

export const projectArchiveCommand = new MedplumCommand('archive')
  .description('Download a full-history archive of a project to a local directory')
  .argument('<directory>', 'Directory to write the archive to')
  .option('--project <projectId>', 'Project to archive. Defaults to the current project')
  .option('--include-audit-events', 'Include AuditEvent resources')
  .option('--cleanup', 'Delete the archive files from the server after downloading them')
  .action(async (directory, options) => {
    const medplum = await createMedplumClient(options);
    const projectId = options.project ?? resolveId(medplum.getActiveLogin()?.project);
    if (!projectId) {
      throw new Error('No current project: run `npx medplum login` or pass --project');
    }
    await archiveProject(medplum, projectId, directory, options);
  });

export const projectRestoreCommand = new MedplumCommand('restore')
  .description('Restore a project archive from a local directory into this server (super admin only)')
  .argument('<directory>', 'Directory containing the archive')
  .action(async (directory, options) => {
    const medplum = await createMedplumClient(options);
    await restoreProject(medplum, directory);
  });

async function archiveProject(
  medplum: MedplumClient,
  projectId: string,
  directory: string,
  options: { includeAuditEvents?: boolean; cleanup?: boolean }
): Promise<void> {
  console.log(`Archiving Project/${projectId}...`);
  const job = await runJob(medplum, medplum.fhirUrl('Project', projectId, '$archive'), {
    resourceType: 'Parameters',
    parameter: [{ name: 'includeAuditEvents', valueBoolean: !!options.includeAuditEvents }],
  });

  mkdirSync(directory, { recursive: true });
  const manifest = job.output as Parameters;
  for (const output of getOutputs(manifest)) {
    const fileName = getFileName(output.type);
    const res = await medplum.downloadResponse(output.url.valueUri as string);
    if (!res.ok || !res.body) {
      throw new Error(`Download of ${output.type} failed: ${res.status} ${res.statusText}`);
    }
    await pipeline(
      Readable.fromWeb(res.body as ReadableStream<Uint8Array>),
      createWriteStream(join(directory, fileName))
    );
    if (options.cleanup) {
      await medplum.deleteResource('Binary', resolveId({ reference: output.url.valueUri }) as string);
    }
    output.url.valueUri = fileName;
    console.log(`Downloaded ${fileName}`);
  }

  writeFileSync(join(directory, MANIFEST_FILE), JSON.stringify(manifest, null, 2));
  console.log(`Archive written to ${directory}`);
}

async function restoreProject(medplum: MedplumClient, directory: string): Promise<void> {
  const manifest = JSON.parse(readFileSync(join(directory, MANIFEST_FILE), 'utf8')) as Parameters;
  for (const output of getOutputs(manifest)) {
    const fileName = getFileName(output.type);
    const binary = await medplum.createBinary({
      data: readFileSync(join(directory, fileName)),
      contentType: NDJSON_CONTENT_TYPE,
      filename: fileName,
    });
    output.url.valueUri = getReferenceString(binary);
    console.log(`Uploaded ${fileName}`);
  }

  console.log('Restoring...');
  const job = await runJob(medplum, medplum.fhirUrl('$restore'), manifest);
  for (const warning of job.output?.parameter?.filter((p) => p.name === 'warning') ?? []) {
    console.log(`Warning: ${warning.valueString}`);
  }
  console.log('Restore complete');
}

async function runJob(medplum: MedplumClient, url: URL, body: Parameters): Promise<AsyncJob> {
  const job = await medplum.post<AsyncJob>(url, body, undefined, {
    pollStatusOnAccepted: true,
    pollStatusPeriod: POLL_PERIOD_MS,
  });
  if (job.status !== 'completed') {
    const outcome = job.output?.parameter?.find((p) => p.name === 'outcome')?.resource;
    throw new Error(`Job ${job.status}: ${outcome ? normalizeErrorString(outcome) : 'unknown error'}`);
  }
  return job;
}

function getOutputs(manifest: Parameters): { type: string; url: ParametersParameter }[] {
  return (manifest.parameter ?? [])
    .filter((p) => p.name === 'output')
    .map((p) => {
      const type = p.part?.find((part) => part.name === 'type')?.valueCode;
      const url = p.part?.find((part) => part.name === 'url');
      if (!type || !url) {
        throw new Error('Archive manifest output is missing a type or url');
      }
      return { type, url };
    });
}

/**
 * File names come from the resource type, never the manifest url, so a manifest cannot point outside the directory.
 * @param resourceType - The archived resource type.
 * @returns The NDJSON file name.
 */
function getFileName(resourceType: string): string {
  if (!/^[A-Za-z]+$/.test(resourceType)) {
    throw new Error(`Invalid resource type in archive manifest: ${resourceType}`);
  }
  return `${resourceType}.ndjson`;
}
