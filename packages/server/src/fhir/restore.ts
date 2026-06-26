// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';

export function isHistoryEntryDeleted(entry: BundleEntry): boolean {
  return (
    entry.response?.status === '410' &&
    entry.response?.outcome?.issue?.some((issue) => issue.code === 'deleted') === true
  );
}

export function isResourceCurrentlyDeleted<T extends Resource>(history: Bundle<T>): boolean {
  return history.entry?.some(isHistoryEntryDeleted) ?? false;
}

export function getLatestNonDeletedHistoryResource<T extends Resource>(history: Bundle<T>): WithId<T> | undefined {
  const entry = history.entry?.find((e) => e.response?.status === '200' && e.resource);
  return entry?.resource as WithId<T> | undefined;
}

export function buildRestoredResource<T extends Resource>(latestVersion: WithId<T>): WithId<T> {
  if (!latestVersion.meta?.deleted) {
    return latestVersion;
  }
  const { deleted: _, ...meta } = latestVersion.meta;
  return { ...latestVersion, meta } as WithId<T>;
}
