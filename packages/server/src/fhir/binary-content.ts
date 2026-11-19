// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Binary, Meta, Reference } from '@medplum/fhirtypes';
import { getBinaryStorage } from '../storage/loader';
import type { BinarySource } from '../storage/types';
import type { Repository } from './repo';

/** The Binary fields a content write sets. Other fields are not accepted. */
export interface BinaryContentFields {
  contentType: string;
  securityContext?: Reference;
  /** `project` and `accounts` are honored as in any `createResource` call, i.e. only for repos allowed to set them. */
  meta?: Pick<Meta, 'project' | 'accounts'>;
}

export type BinaryContentWrite =
  /** Creates a new Binary and stores `source` as its content. */
  | { kind: 'create'; fields: BinaryContentFields; source: BinarySource; filename?: string }
  /** Replaces an existing Binary with `fields` (FHIR PUT semantics) in a new version that stores `source`. */
  | { kind: 'replace'; id: string; fields: BinaryContentFields; source: BinarySource; filename?: string };

/**
 * Creates a Binary with content or replaces a Binary's content. This is the only way server code should do either.
 * @param repo - The repository to write through.
 * @param write - The write to perform.
 * @returns The written Binary, whose `meta.versionId` is the version holding the content.
 */
export async function writeBinaryContent(repo: Repository, write: BinaryContentWrite): Promise<WithId<Binary>> {
  const { binary, stored } = await startBinaryContentWrite(repo, write);
  await stored;
  return binary;
}

/**
 * Like `writeBinaryContent`, but resolves once the Binary is saved, so the caller can stream `source` afterwards.
 * @param repo - The repository to write through.
 * @param write - The write to perform.
 * @returns The written Binary, and a promise that settles once `source` is stored.
 */
export async function startBinaryContentWrite(
  repo: Repository,
  write: BinaryContentWrite
): Promise<{ binary: WithId<Binary>; stored: Promise<void> }> {
  // On replace, the forced version runs writeConstraint even when the fields are unchanged. The previous content is not
  // copied to it: the write below provides the content, and a deferred copy would overwrite it inside a transaction.
  const resource: Binary = { resourceType: 'Binary', ...write.fields };
  const binary =
    write.kind === 'create'
      ? await repo.createResource(resource)
      : await repo.updateResource({ ...resource, id: write.id }, { forceNewVersion: true, skipBinaryCopy: true });
  const stored = getBinaryStorage().writeBinary(binary, write.filename, write.fields.contentType, write.source);
  return { binary, stored };
}
