// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Bundle, BundleEntry, Resource, ResourceType } from '@medplum/fhirtypes';

/** A resource that may carry a canonical `url`, such as a PlanDefinition or Questionnaire. */
type ResourceWithUrl = Resource & { url?: string };

/**
 * Deletes every resource in the project that shares a canonical `url` with a resource in the bundle,
 * so a subsequent import of the bundle installs it from scratch instead of adding duplicates.
 *
 * Every copy of a matching canonical is removed, including duplicates left behind by earlier imports.
 * Resources in the bundle without a `url` are left alone.
 *
 * @param medplum - Medplum client instance.
 * @param bundle - Transaction bundle about to be imported.
 * @returns Number of resources deleted.
 */
export async function deleteExistingDefinitions(medplum: MedplumClient, bundle: Bundle): Promise<number> {
  const urlsByType = new Map<ResourceType, string[]>();
  for (const entry of bundle.entry ?? []) {
    const resource: ResourceWithUrl | undefined = entry.resource;
    if (resource?.url) {
      const urls = urlsByType.get(resource.resourceType) ?? [];
      urls.push(resource.url);
      urlsByType.set(resource.resourceType, urls);
    }
  }

  const existing = (
    await Promise.all(
      Array.from(urlsByType.entries()).map(([resourceType, urls]) =>
        medplum.searchResources(resourceType, { url: urls.join(','), _count: '1000' }, { cache: 'no-cache' })
      )
    )
  ).flat() as Resource[];

  if (existing.length === 0) {
    return 0;
  }

  const entry: BundleEntry[] = existing.map((resource) => ({
    request: { method: 'DELETE', url: `${resource.resourceType}/${resource.id}` },
  }));
  await medplum.executeBatch({ resourceType: 'Bundle', type: 'transaction', entry });
  return existing.length;
}
