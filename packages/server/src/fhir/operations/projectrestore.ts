// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  accepted,
  badRequest,
  concatUrls,
  isResourceType,
  MEDPLUM_VERSION,
  OperationOutcomeError,
  resolveId,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Binary, Parameters, Resource } from '@medplum/fhirtypes';
import { createInterface } from 'node:readline';
import { getConfig } from '../../config/loader';
import { requireSuperAdmin } from '../../context';
import { getBinaryStorage } from '../../storage/loader';
import type { Repository } from '../repo';
import { SelectQuery } from '../sql';
import { AsyncJobExecutor } from './utils/asyncjobexecutor';

const restoreBatchSize = 500;

/**
 * Handles a Project restore request.
 * Restores a Project/$archive into this server, preserving ids, version ids, and meta.
 * The input is the archive AsyncJob output, with each output url pointing at a Binary on this server.
 *
 * Endpoint
 *   [fhir base]/$restore
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function projectRestoreHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = requireSuperAdmin();
  const manifest = req.body as Parameters;
  const projectId = resolveId(manifest.parameter?.find((p) => p.name === 'project')?.valueReference);
  if (!projectId) {
    return [badRequest('Missing project')];
  }
  await checkExistingProject(ctx.repo, projectId, getOutputs(manifest));

  const { baseUrl } = getConfig();
  const exec = new AsyncJobExecutor(ctx.repo);
  await exec.init(concatUrls(baseUrl, 'fhir/R4' + req.pathname));
  exec.start(() => restoreProject(ctx.repo, projectId, manifest));
  return [accepted(exec.getContentLocation(baseUrl))];
}

async function restoreProject(repo: Repository, projectId: string, manifest: Parameters): Promise<Parameters> {
  const warnings: string[] = [];
  const archiveVersion = manifest.parameter?.find((p) => p.name === 'medplumVersion')?.valueString;
  if (archiveVersion !== MEDPLUM_VERSION) {
    warnings.push(`Archive created by Medplum ${archiveVersion}, restored into ${MEDPLUM_VERSION}`);
  }

  for (const { type, url } of getOutputs(manifest)) {
    if (!isResourceType(type)) {
      warnings.push(`Skipped unknown resource type ${type}`);
      continue;
    }

    let batch: Resource[] = [];
    for await (const resource of readArchiveFile(repo, url)) {
      batch.push(resource);
      if (batch.length === restoreBatchSize) {
        await repo.restoreResourceVersions(type, projectId, batch);
        batch = [];
      }
    }
    if (batch.length) {
      await repo.restoreResourceVersions(type, projectId, batch);
    }
  }

  return { resourceType: 'Parameters', parameter: warnings.map((w) => ({ name: 'warning', valueString: w })) };
}

function getOutputs(manifest: Parameters): { type: string; url: string }[] {
  return (manifest.parameter ?? [])
    .filter((p) => p.name === 'output')
    .map((p) => ({
      type: p.part?.find((part) => part.name === 'type')?.valueCode as string,
      url: p.part?.find((part) => part.name === 'url')?.valueUri as string,
    }));
}

async function* readArchiveFile(repo: Repository, url: string): AsyncGenerator<Resource> {
  const binary = await repo.readReference<Binary>({ reference: url });
  for await (const line of createInterface({ input: await getBinaryStorage().readBinary(binary) })) {
    if (line) {
      yield JSON.parse(line);
    }
  }
}

/**
 * An existing project can only be restored over by an archive of that same project, proven by a
 * shared Project version id. Version ids are random, so a crafted archive cannot claim another
 * tenant's project.
 * @param repo - The super admin repository.
 * @param projectId - The project being restored.
 * @param outputs - The archive outputs.
 */
async function checkExistingProject(
  repo: Repository,
  projectId: string,
  outputs: { type: string; url: string }[]
): Promise<void> {
  const history = await repo.sqlRead<{ versionId: string }>(
    new SelectQuery('Project_History').column('versionId').where('id', '=', projectId),
    'Project'
  );
  if (!history.length) {
    return;
  }
  const archived = new Set<string | undefined>();
  for (const { type, url } of outputs) {
    if (type === 'Project') {
      for await (const resource of readArchiveFile(repo, url)) {
        archived.add(resource.meta?.versionId);
      }
    }
  }
  if (!history.some((h) => archived.has(h.versionId))) {
    throw new OperationOutcomeError(badRequest(`Project/${projectId} already exists and is not from this archive`));
  }
}
