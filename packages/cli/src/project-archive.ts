// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString, isUUID, normalizeErrorString, resolveId } from '@medplum/core';
import type { AsyncJob, Binary, Bot, Parameters, ParametersParameter, Resource } from '@medplum/fhirtypes';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openAsBlob,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { createMedplumClient } from './util/client';
import { MedplumCommand } from './utils';

const NDJSON_CONTENT_TYPE = 'application/fhir+ndjson';
const MANIFEST_FILE = 'manifest.json';
const POLL_PERIOD_MS = 2000;
const BINARIES_DIR = 'binaries';
const BINARY_CONCURRENCY = 5;

export const projectArchiveCommand = new MedplumCommand('archive')
  .description('Download a full-history archive of a project to a local directory')
  .argument('<directory>', 'Directory to write the archive to')
  .option('--include-audit-events', 'Include AuditEvent resources')
  .option('--cleanup', 'Expunge the temporary archive files from the server after downloading them')
  .option('--binaries', 'Also download the current content of each Binary')
  .action(async (directory, options) => {
    const medplum = await createMedplumClient(options);
    // $archive only allows the current project
    const projectId = resolveId(medplum.getActiveLogin()?.project);
    if (!projectId) {
      throw new Error('No current project: run `npx medplum login` and `npx medplum project switch`');
    }
    await archiveProject(medplum, projectId, directory, options);
    if (options.binaries) {
      await downloadBinaries(medplum, directory);
    }
  });

export const projectRestoreCommand = new MedplumCommand('restore')
  .description('Restore a project archive from a local directory into this server (super admin only)')
  .argument('<directory>', 'Directory containing the archive')
  .option('--binaries', 'Also upload Binary content downloaded with `archive --binaries`')
  .option('--cleanup', 'Expunge the temporary uploaded archive files from the server after the restore completes')
  .action(async (directory, options) => {
    const medplum = await createMedplumClient(options);
    await restoreProject(medplum, directory, !!options.cleanup);
    if (options.binaries) {
      await uploadBinaries(medplum, directory);
    }
  });

export const projectDeployBotsCommand = new MedplumCommand('deploy-bots')
  .description('Deploy the Bots of a restored project archive. Enable the bots feature on the project first')
  .argument('<directory>', 'Directory containing the archive')
  .action(async (directory, options) => {
    const medplum = await createMedplumClient(options);
    await deployBots(medplum, directory);
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
    console.log(`Downloaded ${fileName}`);
  }

  const serverUrls = getOutputs(manifest).map((output) => output.url.valueUri as string);
  for (const output of getOutputs(manifest)) {
    output.url.valueUri = getFileName(output.type);
  }
  writeFileSync(join(directory, MANIFEST_FILE), JSON.stringify(manifest, null, 2));
  console.log(`Archive written to ${directory}`);

  // Only after the whole archive is safely on disk
  if (options.cleanup) {
    await expungeBinaries(medplum, serverUrls);
  }
}

async function restoreProject(medplum: MedplumClient, directory: string, cleanup: boolean): Promise<void> {
  // The manifest is only used in memory, so its urls are rewritten in place to the uploaded Binaries
  const manifest = JSON.parse(readFileSync(join(directory, MANIFEST_FILE), 'utf8')) as Parameters;
  for (const output of getOutputs(manifest)) {
    const fileName = getFileName(output.type);
    const binary = await medplum.createBinary({
      data: await openAsBlob(join(directory, fileName)),
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

  if (cleanup) {
    await expungeBinaries(
      medplum,
      getOutputs(manifest).map((output) => output.url.valueUri as string)
    );
  }
}

/**
 * Expunges server-side archive files. Deleting would leave their content in binary storage.
 * @param medplum - The Medplum client.
 * @param urls - The Binary references.
 */
async function expungeBinaries(medplum: MedplumClient, urls: string[]): Promise<void> {
  for (const url of urls) {
    await medplum.post(medplum.fhirUrl('Binary', resolveId({ reference: url }) as string, '$expunge'), {});
  }
  console.log(`Expunged ${urls.length} archive files from the server`);
}

async function downloadBinaries(medplum: MedplumClient, directory: string): Promise<void> {
  const binaryDir = join(directory, BINARIES_DIR);
  mkdirSync(binaryDir, { recursive: true });
  const binaries = await readCurrentVersions<Binary>(directory, 'Binary');
  let missing = 0;
  // Files are renamed into place when complete, so a rerun skips finished downloads
  await forEachConcurrent(binaries, async (binary) => {
    const path = join(binaryDir, binary.id);
    if (existsSync(path)) {
      return;
    }
    const res = await medplum.downloadResponse(`Binary/${binary.id}`);
    if (res.status === 404) {
      // The Binary resource exists but its content was never stored, e.g. an incomplete upload
      missing++;
      return;
    }
    if (!res.ok || !res.body) {
      throw new Error(`Download of Binary/${binary.id} failed: ${res.status} ${res.statusText}`);
    }
    await pipeline(Readable.fromWeb(res.body as ReadableStream<Uint8Array>), createWriteStream(path + '.part'));
    renameSync(path + '.part', path);
  });
  if (missing) {
    console.log(`Warning: ${missing} Binary resources have no content on the server`);
  }
  console.log(`Downloaded ${binaries.length - missing} Binary files`);
}

async function uploadBinaries(medplum: MedplumClient, directory: string): Promise<void> {
  let missing = 0;
  await forEachConcurrent(await readCurrentVersions<Binary>(directory, 'Binary'), async (binary) => {
    const path = join(directory, BINARIES_DIR, binary.id);
    if (!existsSync(path)) {
      missing++;
      return;
    }
    // Presigned upload writes into the restored current version, rather than creating a new version
    const params = await medplum.get<Parameters>(medplum.fhirUrl('Binary', binary.id, '$presigned-url?upload=true'));
    const url = params.parameter?.find((p) => p.name === 'url')?.valueUri as string;
    const res = await fetch(url, {
      method: 'PUT',
      body: await openAsBlob(path),
      // Azure SAS uploads require x-ms-blob-type; other storage backends ignore it
      headers: { 'x-ms-blob-type': 'BlockBlob', ...(binary.contentType ? { 'Content-Type': binary.contentType } : {}) },
    });
    if (!res.ok) {
      throw new Error(`Upload of Binary/${binary.id} failed: ${res.status} ${res.statusText}`);
    }
  });
  if (missing) {
    console.log(`Warning: ${missing} Binary files not found in ${join(directory, BINARIES_DIR)}`);
  }
  console.log('Uploaded Binary files');
}

async function deployBots(medplum: MedplumClient, directory: string): Promise<void> {
  let failed = 0;
  for (const bot of (await readCurrentVersions<Bot>(directory, 'Bot')).filter((b) => b.executableCode)) {
    try {
      await medplum.post(medplum.fhirUrl('Bot', bot.id, '$deploy'), {});
      console.log(`Deployed Bot/${bot.id} (${bot.name})`);
    } catch (err) {
      failed++;
      console.log(`Failed to deploy Bot/${bot.id} (${bot.name}): ${normalizeErrorString(err)}`);
    }
  }
  if (failed) {
    throw new Error(`${failed} Bots failed to deploy`);
  }
}

/**
 * Reads the current version of each resource that is not deleted from an archive NDJSON file.
 * Ids are used as local file names, so they must be UUIDs.
 * @param directory - The archive directory.
 * @param resourceType - The resource type.
 * @returns The current, non-deleted resources.
 */
async function readCurrentVersions<T extends Resource>(
  directory: string,
  resourceType: T['resourceType']
): Promise<WithId<T>[]> {
  const path = join(directory, getFileName(resourceType));
  if (!existsSync(path)) {
    return [];
  }
  const current = new Map<string, WithId<T>>();
  for await (const line of createInterface({ input: createReadStream(path) })) {
    if (line) {
      const resource = JSON.parse(line) as WithId<T>;
      if (!isUUID(resource.id)) {
        throw new Error(`Invalid id in archive: ${resourceType}/${resource.id}`);
      }
      // Versions are in lastUpdated order, so the last one is current
      current.set(resource.id, resource);
    }
  }
  return [...current.values()].filter((r) => !r.meta?.deleted);
}

async function forEachConcurrent<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      try {
        await fn(items[next++]);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: BINARY_CONCURRENCY }, worker));
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
