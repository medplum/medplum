// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  createReference,
  forbidden,
  isOk,
  isResource,
  normalizeOperationOutcome,
  OperationOutcomeError,
} from '@medplum/core';
import type { FhirRepository, FhirRequest, FhirResponse, FhirRouter } from '@medplum/fhir-router';
import { processBatch } from '@medplum/fhir-router';
import type { Binary, Bundle, PackageRelease } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { getBinaryStorage } from '../../storage/loader';
import { readStreamToString } from '../../util/streams';

/**
 * Handles a package install request.
 *
 * Endpoint: [fhir base]/PackageRelease/[id]/$install
 * @param req - The FHIR request.
 * @param repo - The FHIR repository.
 * @param router - The FHIR router.
 * @returns The FHIR response.
 */
export async function packageInstallHandler(
  req: FhirRequest,
  repo: FhirRepository,
  router: FhirRouter
): Promise<FhirResponse> {
  const { project, membership, systemRepo } = getAuthenticatedContext();
  if (!project.superAdmin && !membership.admin) {
    return [forbidden];
  }

  const { id } = req.params;
  const packageRelease = await repo.readResource<PackageRelease>('PackageRelease', id);
  const binary = await repo.readReference<Binary>({
    reference: packageRelease.content.url as string,
  });
  const installation = await systemRepo.createResource({
    resourceType: 'PackageInstallation',
    meta: { project: project.id },
    package: packageRelease.package,
    packageRelease: createReference(packageRelease),
    status: 'installing',
    version: packageRelease.version,
    installedBy: membership.profile,
  });

  try {
    const stream = await getBinaryStorage().readBinary(binary);
    const json = await readStreamToString(stream);
    const bundle = JSON.parse(json);
    getLogger().info('Installing package', {
      profile: membership.profile,
      package: packageRelease.package,
      version: packageRelease.version,
    });
    const result = await processBatch(req, repo, router, bundle);
    validateBatchResponse(result);
    await systemRepo.updateResource({ ...installation, status: 'installed' });
    return [allOk, result];
  } catch (err) {
    getLogger().error('Package install failed', { err });
    await systemRepo.updateResource({ ...installation, status: 'error' });
    return [normalizeOperationOutcome(err)];
  }
}

function validateBatchResponse(result: Bundle): void {
  for (const entry of result.entry ?? []) {
    const outcome = entry.response?.outcome;
    if (outcome && isResource(outcome, 'OperationOutcome') && !isOk(outcome)) {
      throw new OperationOutcomeError(outcome);
    }
  }
}
