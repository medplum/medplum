// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { deepEquals, getStatus, isOperationOutcome, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import type { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';

/** One resource a configuration page wants stored. */
export interface ConfigChange<T extends Resource = Resource> {
  /** The resource as the page loaded it. Absent for one being created. */
  readonly stored?: WithId<T>;
  /** The resource as the page wants it stored. */
  readonly draft: T;
}

export interface ConfigSaveFailure {
  readonly change: ConfigChange;
  /** The resource changed on the server after the page loaded it, so nothing was written over it. */
  readonly conflict: boolean;
  readonly message: string;
}

export interface ConfigSaveResult {
  /** What the server stored for each change that went through, in the order the changes were given. */
  readonly saved: { readonly change: ConfigChange; readonly resource: WithId<Resource> }[];
  readonly failures: ConfigSaveFailure[];
}

const PRECONDITION_FAILED = 412;

/**
 * Stores a page's changes as one transaction, sending only the resources that differ from what was loaded.
 *
 * Every update is conditional on the version the page loaded, so a write another system made in between
 * fails that entry instead of being overwritten. A project without the `transaction-bundles` feature applies
 * the bundle as a batch, so some entries can land while others fail: each is reported for what happened to it.
 * @param medplum - The Medplum client.
 * @param changes - The resources the page holds, changed or not.
 * @returns What was stored and what was not.
 */
export async function saveConfigChanges(
  medplum: MedplumClient,
  changes: readonly ConfigChange[]
): Promise<ConfigSaveResult> {
  const pending = changes.filter((change) => !change.stored || !deepEquals(change.stored, change.draft));
  if (pending.length === 0) {
    return { saved: [], failures: [] };
  }

  const bundle: Bundle = { resourceType: 'Bundle', type: 'transaction', entry: pending.map(toEntry) };

  let response: Bundle;
  try {
    response = await medplum.executeBatch(bundle);
  } catch (err) {
    // Refused as a whole, so nothing was written.
    const conflict = err instanceof OperationOutcomeError && getStatus(err.outcome) === PRECONDITION_FAILED;
    const message = normalizeErrorString(err);
    return { saved: [], failures: pending.map((change) => ({ change, conflict, message })) };
  }

  const saved: ConfigSaveResult['saved'] = [];
  const failures: ConfigSaveFailure[] = [];
  pending.forEach((change, index) => {
    const entry = response.entry?.[index];
    const status = Number.parseInt(entry?.response?.status ?? '', 10);
    if (status >= 200 && status < 300 && entry?.resource?.id) {
      saved.push({ change, resource: entry.resource as WithId<Resource> });
      return;
    }
    const outcome = entry?.response?.outcome;
    failures.push({
      change,
      conflict: status === PRECONDITION_FAILED,
      message: isOperationOutcome(outcome) ? normalizeErrorString(outcome) : `Not saved (${entry?.response?.status})`,
    });
  });

  for (const resourceType of new Set(saved.map(({ resource }) => resource.resourceType))) {
    medplum.invalidateSearches(resourceType);
  }
  return { saved, failures };
}

function toEntry(change: ConfigChange): BundleEntry {
  const { stored, draft } = change;
  if (!stored) {
    return { resource: draft, request: { method: 'POST', url: draft.resourceType } };
  }
  return {
    resource: draft,
    request: {
      method: 'PUT',
      url: `${stored.resourceType}/${stored.id}`,
      ...(stored.meta?.versionId && { ifMatch: `W/"${stored.meta.versionId}"` }),
    },
  };
}
