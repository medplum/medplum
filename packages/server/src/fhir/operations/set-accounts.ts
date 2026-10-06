// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import {
  accepted,
  AccessPolicyInteraction,
  allOk,
  badRequest,
  concatUrls,
  conflict,
  EMPTY,
  extractAccountReferences,
  forbidden,
  getReferenceString,
  getStatus,
  isGone,
  isNotFound,
  isResourceType,
  notFound,
  OperationOutcomeError,
  parseSearchRequest,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { AsyncJob, Parameters, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { getCacheRedis } from '../../redis';
import { getAsyncJobTracking } from '../../workers/base';
import { addSetAccountsJobData } from '../../workers/set-accounts';
import { CancelledError } from '../../workers/utils';
import { getPatients } from '../patient';
import type { Repository, SystemRepository } from '../repo';
import { makeOperationDefinition } from './definitions';
import { searchPatientCompartment } from './patienteverything';
import { AsyncJobExecutor } from './utils/asyncjobexecutor';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation = makeOperationDefinition(
  { scope: 'instance', resource: 'Resource' as ResourceType },
  {
    id: 'set-accounts',
    name: 'SetAccounts',
    code: 'set-accounts',
    description: `Updates account references for the target resource, and optionally any resources in the target's FHIR compartment`,
    parameter: [
      {
        use: 'in',
        name: 'accounts',
        documentation: 'List of account references to set',
        type: 'Reference',
        min: 0,
        max: '*',
      },
      {
        use: 'in',
        name: 'propagate',
        documentation: 'If set, also push changes to other resources in the compartment of the target resource',
        type: 'boolean',
        min: 0,
        max: '1',
      },
      {
        use: 'out',
        name: 'resourcesUpdated',
        documentation: 'Number of resources that were updated',
        type: 'integer',
        min: 1,
        max: '1',
      },
    ],
  }
);

export interface SetAccountsParameters {
  accounts: Reference[];
  propagate?: boolean;
}

/**
 * Handles the $set-accounts operation.
 * This operation updates the account reference for  a resource, and optionally
 * all resources in the target compartment as well.
 *
 * NOTE: the operation is currently capped at 1000 resources in the patient compartment.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function setAccountsHandler(req: FhirRequest): Promise<FhirResponse> {
  const { id, resourceType } = req.params;
  if (!id || !resourceType) {
    return [badRequest('Must specify resource type and ID')];
  }

  if (!isResourceType(resourceType)) {
    return [badRequest('Invalid resource type')];
  }

  const params = parseInputParameters<SetAccountsParameters>(operation, req);

  const { repo, authState } = getAuthenticatedContext();
  if (req.headers?.['prefer'] === 'respond-async' && params.propagate) {
    const { baseUrl } = getConfig();
    const exec = new AsyncJobExecutor(repo);
    const asyncJob = await exec.init(concatUrls(baseUrl, `${resourceType}/${id}/$set-accounts`));
    await exec.run(async () => {
      await addSetAccountsJobData({
        tracking: getAsyncJobTracking(asyncJob),
        resourceType,
        id,
        accounts: params.accounts,
        authState,
      });
    });

    return [accepted(exec.getContentLocation(baseUrl))];
  } else {
    const result = await setResourceAccounts(repo, resourceType, id, params);
    return [allOk, result];
  }
}

export async function setResourceAccounts(
  repo: Repository,
  resourceType: ResourceType,
  id: string,
  params: SetAccountsParameters
): Promise<Parameters>;
export async function setResourceAccounts(
  repo: Repository,
  resourceType: ResourceType,
  id: string,
  params: SetAccountsParameters,
  asyncJobId: string
): Promise<Parameters | undefined>;
/**
 * Sets the `meta.accounts` array for the given resource, and optionally all resources in its compartment.
 * @param repo - The FHIR repository of the user.
 * @param resourceType - The type of the target resource.
 * @param id - The ID of the target resource.
 * @param params - Operation parameters.
 * @param asyncJobId - (Optional) ID to use to track the status of the parent job.
 * @returns The number of resources updated, or undefined if the operation could not finish.
 */
export async function setResourceAccounts(
  repo: Repository,
  resourceType: ResourceType,
  id: string,
  params: SetAccountsParameters,
  asyncJobId?: string
): Promise<Parameters | undefined> {
  const isSuperAdmin = repo.isSuperAdmin();
  if (!repo.isProjectAdmin() && !isSuperAdmin) {
    throw new OperationOutcomeError(forbidden);
  }

  const lock = await TargetLock.acquire(resourceType, id);
  try {
    return await setLockedResourceAccounts(repo, resourceType, id, params, lock, asyncJobId);
  } finally {
    await lock.release();
  }
}

async function setLockedResourceAccounts(
  repo: Repository,
  resourceType: ResourceType,
  id: string,
  params: SetAccountsParameters,
  lock: TargetLock,
  asyncJobId?: string
): Promise<Parameters | undefined> {
  // Use extended mode to read the resource, ensuring we get access to the full `meta.accounts`
  const systemRepo = repo.getSystemRepo();
  const userRepo = repo.withOverrideConfig({ extendedMode: true });

  const accounts = params.accounts;

  await getAuthenticatedContext().fhirRateLimiter?.recordWrite();
  // Each read+write below runs in one transaction, so the read comes from the database rather
  // than the cache, and a concurrent write to the same resource retries against the newer version
  const { target, oldAccounts } = await systemRepo.withTransaction(
    async (txRepo) => {
      const target = await txRepo.readResource(resourceType, id);
      // Ensure user's repo can read this resource as well
      if (!userRepo.canPerformInteraction(AccessPolicyInteraction.READ, target)) {
        throw new OperationOutcomeError(notFound);
      }
      const oldAccounts = extractAccountReferences(target.meta);

      // Update the target resource with the new accounts
      target.meta = {
        ...target.meta,
        accounts: accounts,
        account: accounts?.[0],
      };
      if (!userRepo.canPerformInteraction(AccessPolicyInteraction.UPDATE, target)) {
        throw new OperationOutcomeError(forbidden);
      }
      return { target: await txRepo.updateResource(target), oldAccounts };
    },
    { resourceTypes: resourceType, source: 'setAccounts.target' }
  );
  let count = 1; // Target resource is updated already

  if (params.propagate && target.resourceType === 'Patient') {
    // Every target account is added, so a re-run restores any that are missing. Removals come from
    // the difference with the previous accounts, which only this run knows.
    const removals = oldAccounts?.filter((o) => !accounts.some((a) => a.reference === o.reference)) ?? [];

    try {
      // Update the resources in the target compartment to trigger meta.accounts refresh
      count += await propagateToCompartment(userRepo, target, accounts, removals, lock, asyncJobId);
    } catch (err) {
      // Restore the old accounts on the target so that re-running the operation computes the same
      // additions and removals, and finishes propagating them. A cancelled job keeps the new accounts.
      if (!(err instanceof CancelledError)) {
        await revertTargetAccounts(systemRepo, target, oldAccounts);
      }
      throw err;
    }
  }

  return buildOutputParameters(operation, { resourcesUpdated: count });
}

async function propagateToCompartment(
  repo: Repository,
  target: WithId<Resource>,
  accounts: Reference[],
  removals: Reference[],
  lock: TargetLock,
  asyncJobId: string | undefined
): Promise<number> {
  let count = 0;
  const systemRepo = repo.getSystemRepo();

  const search: Partial<SearchRequest> = { offset: 0, count: 1000 };
  const maxSearchOffset = getConfig().maxSearchOffset ?? Number.POSITIVE_INFINITY;
  while ((search.offset ?? 0) <= maxSearchOffset) {
    await lock.renewIfDue();
    if (asyncJobId) {
      const shouldContinue = await shouldJobContinue(systemRepo, asyncJobId);
      if (!shouldContinue) {
        throw new CancelledError('Job cancelled');
      }
    }

    const bundle = await searchPatientCompartment(repo, target, search);
    for (const entry of bundle.entry ?? EMPTY) {
      const resource = entry.resource;
      if (resource && resource.resourceType !== 'Patient') {
        await lock.renewIfDue();
        if (await updateCompartmentResource(systemRepo, target, resource, accounts, removals)) {
          count++;
        }
      }
    }
    const nextLink = bundle.link?.find((l) => l.relation === 'next');
    if (nextLink?.url) {
      // Update search pagination to next page
      const nextSearch = parseSearchRequest(nextLink.url);
      search.offset = nextSearch.offset;
      search.cursor = nextSearch.cursor;
    } else {
      break;
    }
  }

  return count;
}

async function updateCompartmentResource(
  systemRepo: SystemRepository,
  target: WithId<Resource>,
  resource: Resource,
  additions: Reference[],
  removals: Reference[]
): Promise<boolean> {
  // The compartment search ran after the target was updated; skip resources that are already correct
  if (hasAccounts(resource, applyAccountChanges(extractAccountReferences(resource.meta), additions, removals))) {
    return true;
  }

  const { resourceType } = resource;
  const id = resource.id as string;
  await getAuthenticatedContext().fhirRateLimiter?.recordWrite();
  try {
    await systemRepo.withTransaction(
      async (txRepo) => {
        const current = await txRepo.readResource(resourceType, id);
        const currentAccounts = extractAccountReferences(current.meta);
        const accountList = applyAccountChanges(
          currentAccounts,
          additions,
          await excludeOtherPatientAccounts(txRepo, target, current, currentAccounts, removals)
        );
        current.meta = {
          ...current.meta,
          accounts: accountList,
          account: accountList?.[0],
        };
        await txRepo.updateResource(current);
      },
      { resourceTypes: [resourceType, 'Patient'], source: 'setAccounts.compartment' }
    );
    return true;
  } catch (err) {
    if (err instanceof OperationOutcomeError && (isGone(err.outcome) || isNotFound(err.outcome))) {
      return false;
    }
    throw err;
  }
}

async function excludeOtherPatientAccounts(
  txRepo: SystemRepository,
  target: WithId<Resource>,
  resource: Resource,
  accounts: Reference[] | undefined,
  removals: Reference[]
): Promise<Reference[]> {
  const applicable = removals.filter((r) => accounts?.some((a) => a.reference === r.reference));
  if (!applicable.length) {
    return applicable;
  }
  const targetRef = getReferenceString(target);
  const patientRefs = getPatients(resource).filter((p) => p.reference !== targetRef);
  if (!patientRefs.length) {
    return applicable;
  }

  // Don't remove any accounts provided by other existing Patients
  const otherPatients = await txRepo.readReferences(patientRefs);
  const retained = otherPatients.flatMap((p) =>
    p instanceof Error ? EMPTY : (extractAccountReferences(p.meta) ?? EMPTY)
  );
  return applicable.filter((r) => !retained.some((a) => a.reference === r.reference));
}

/**
 * Returns a copy of an account list with additions appended and removals dropped.
 * @param accounts - The current accounts.
 * @param additions - Accounts to add, if not already present.
 * @param removals - Accounts to remove.
 * @returns The updated accounts.
 */
function applyAccountChanges(
  accounts: Reference[] | undefined,
  additions: Reference[],
  removals: Reference[]
): Reference[] | undefined {
  let result = accounts?.filter((a) => !removals.some((r) => r.reference === a.reference));
  for (const added of additions) {
    if (!result?.some((a) => a.reference === added.reference)) {
      result = [...(result ?? []), added];
    }
  }
  return result;
}

/**
 * Checks whether a resource stores exactly the given accounts, in the form a write would store them.
 * @param resource - The resource.
 * @param accounts - The accounts to compare against.
 * @returns True if `meta.accounts` matches in order and `meta.account` is the first of them.
 */
function hasAccounts(resource: Resource, accounts: Reference[] | undefined): boolean {
  const stored = resource.meta?.accounts ?? [];
  const expected = accounts ?? [];
  return (
    stored.length === expected.length &&
    stored.every((a, i) => a.reference === expected[i].reference) &&
    resource.meta?.account?.reference === expected[0]?.reference
  );
}

/**
 * Sets the target's accounts back to their previous value after propagation fails, unless the target
 * was written again since this operation updated it. Failures are logged rather than thrown, so the
 * propagation error is what the caller sees.
 * @param systemRepo - The system repository.
 * @param target - The target resource, as this operation wrote it.
 * @param oldAccounts - The target's accounts before this operation.
 */
async function revertTargetAccounts(
  systemRepo: SystemRepository,
  target: WithId<Resource>,
  oldAccounts: Reference[] | undefined
): Promise<void> {
  const resource = getReferenceString(target);
  try {
    await systemRepo.updateResource(
      { ...target, meta: { ...target.meta, accounts: oldAccounts, account: oldAccounts?.[0] } },
      { ifMatch: target.meta?.versionId }
    );
  } catch (err) {
    if (err instanceof OperationOutcomeError && getStatus(err.outcome) === 412) {
      getLogger().warn('Skipped reverting accounts after incomplete propagation: target changed', { resource });
      return;
    }
    getLogger().error('Failed to revert accounts after incomplete propagation', { resource, err });
  }
}

const TARGET_LOCK_TTL_MS = 5 * 60 * 1000;

// Extend or delete the lock only while this run still holds it
const RENEW_LOCK_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) end return 0`;
const RELEASE_LOCK_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`;

/**
 * Allows one $set-accounts run per target at a time, since concurrent runs can interleave their
 * additions and removals and leave stale accounts on compartment resources. The lock expires if its
 * holder dies, and a live run renews it as it works.
 */
class TargetLock {
  private readonly key: string;
  private readonly token: string;
  private lastRenewed = Date.now();

  private constructor(key: string, token: string) {
    this.key = key;
    this.token = token;
  }

  static async acquire(resourceType: ResourceType, id: string): Promise<TargetLock> {
    const key = `medplum:set-accounts:${resourceType}/${id}`;
    const token = randomUUID();
    if ((await getCacheRedis().set(key, token, 'PX', TARGET_LOCK_TTL_MS, 'NX')) !== 'OK') {
      throw new OperationOutcomeError(conflict(`$set-accounts is already running for ${resourceType}/${id}`));
    }
    return new TargetLock(key, token);
  }

  async renewIfDue(): Promise<void> {
    if (Date.now() - this.lastRenewed < TARGET_LOCK_TTL_MS / 3) {
      return;
    }
    if (!(await getCacheRedis().eval(RENEW_LOCK_SCRIPT, 1, this.key, this.token, TARGET_LOCK_TTL_MS))) {
      throw new OperationOutcomeError(conflict('$set-accounts lost its lock on the target'));
    }
    this.lastRenewed = Date.now();
  }

  async release(): Promise<void> {
    try {
      await getCacheRedis().eval(RELEASE_LOCK_SCRIPT, 1, this.key, this.token);
    } catch (err) {
      // The lock expires on its own; don't replace the operation's result or error
      getLogger().warn('Failed to release $set-accounts lock', { key: this.key, err });
    }
  }
}

const healthyJobStatuses: AsyncJob['status'][] = ['accepted', 'active'];
async function shouldJobContinue(systemRepo: SystemRepository, asyncJobId: string): Promise<boolean> {
  const asyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJobId);
  return healthyJobStatuses.includes(asyncJob.status);
}
