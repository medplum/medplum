// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { accepted, badRequest, concatUrls, isResourceType, MEDPLUM_VERSION, resolveId } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Binary, Parameters, Resource } from '@medplum/fhirtypes';
import { createInterface } from 'node:readline';
import { getConfig } from '../../config/loader';
import { requireSuperAdmin } from '../../context';
import { getBinaryStorage } from '../../storage/loader';
import type { Repository } from '../repo';
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

  for (const output of manifest.parameter?.filter((p) => p.name === 'output') ?? []) {
    const type = output.part?.find((p) => p.name === 'type')?.valueCode as string;
    const url = output.part?.find((p) => p.name === 'url')?.valueUri as string;
    if (!isResourceType(type)) {
      warnings.push(`Skipped unknown resource type ${type}`);
      continue;
    }

    const binary = await repo.readReference<Binary>({ reference: url });
    let batch: Resource[] = [];
    for await (const line of createInterface({ input: await getBinaryStorage().readBinary(binary) })) {
      if (line) {
        batch.push(JSON.parse(line));
      }
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
