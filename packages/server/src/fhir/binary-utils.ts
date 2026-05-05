// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Binary } from '@medplum/fhirtypes';
import type { Repository } from './repo';

/**
 * Reads a Binary and enforces securityContext read authorization when present.
 * @param repo - The repository configured for the current user.
 * @param id - The Binary resource ID.
 * @param versionId - Optional Binary version ID.
 * @returns The authorized Binary resource.
 */
export async function readAuthorizedBinary(
  repo: Repository,
  id: string,
  versionId?: string
): Promise<WithId<Binary>> {
  const binary = versionId
    ? await repo.readVersion<Binary>('Binary', id, versionId)
    : await repo.readResource<Binary>('Binary', id);
  await checkBinarySecurityContext(repo, binary);
  return binary;
}

/**
 * Enforces securityContext read access for a Binary when present.
 * @param repo - The repository configured for the current user.
 * @param binary - The Binary resource to validate.
 */
export async function checkBinarySecurityContext(repo: Repository, binary: Binary): Promise<void> {
  if (binary.securityContext) {
    await repo.readReference(binary.securityContext);
  }
}
