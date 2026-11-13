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
 * This operation updates the account reference for a resource, and optionally
 * all resources in the target compartment as well.
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

  // Use extended mode to read the resource, ensuring we get access to the full `meta.accounts`
  const userRepo = repo.withOverrideConfig({ extendedMode: true });
  if (resourceType !== 'Patient') {
    // Only a Patient has a compartment to propagate to, and a write to any other target is atomic on its own
    await updateTargetResource(userRepo, resourceType, id, params.accounts);
    return buildOutputParameters(operation, { resourcesUpdated: 1 });
  }

  // A Patient's accounts must not change while its compartment is being propagated to, so every run on
  // a Patient takes the lock. The lock is keyed by the Patient alone, so check access first to keep
  // callers who cannot see the Patient from holding it.
  if (!(await userRepo.canPerformInteractionById(AccessPolicyInteraction.READ, resourceType, id))) {
    throw new OperationOutcomeError(notFound);
  }
  const lock = await TargetLock.acquire(resourceType, id, asyncJobId);
  try {
    return await setPatientAccounts(userRepo, id, params, lock, asyncJobId);
  } finally {
    await lock.release();
  }
}

async function setPatientAccounts(
  userRepo: Repository,
  id: string,
  params: SetAccountsParameters,
  lock: TargetLock,
  asyncJobId?: string
): Promise<Parameters | undefined> {
  const accounts = params.accounts;
  const { target, oldAccounts } = await updateTargetResource(userRepo, 'Patient', id, accounts);
  let count = 1; // Target resource is updated already

  if (params.propagate) {
    // Every target account is added, so a re-run restores any that are missing. Removals come from
    // the difference with the previous accounts, which only this run knows.
    const removals = oldAccounts?.filter((o) => !accounts.some((a) => a.reference === o.reference)) ?? [];

    // Update the resources in the target compartment to trigger meta.accounts refresh
    count += await propagateToCompartment(userRepo, target, accounts, removals, lock, asyncJobId);
  }

  return buildOutputParameters(operation, { resourcesUpdated: count });
}

async function updateTargetResource(
  userRepo: Repository,
  resourceType: ResourceType,
  id: string,
  accounts: Reference[]
): Promise<{ target: WithId<Resource>; oldAccounts: Reference[] | undefined }> {
  const systemRepo = userRepo.getSystemRepo();
  await getAuthenticatedContext().fhirRateLimiter?.recordWrite();

  // Each read+write below runs in one transaction, so the read comes from the database rather
  // than the cache, and a concurrent write to the same resource retries against the newer version
  return systemRepo.withTransaction(
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
  // Writes move resources to the end of the _lastUpdated cursor, so later pages return them again.
  // Re-check those resources, but count them only if they need a write.
  const startTime = Date.now();

  const search: Partial<SearchRequest> = { offset: 0, count: 1000 };
  const maxSearchOffset = getConfig().maxSearchOffset ?? Number.POSITIVE_INFINITY;
  while ((search.offset ?? 0) <= maxSearchOffset) {
    // Check the lock on every page, so a run that lost it, e.g. to a retry of its job, stops within a page
    await lock.renew();
    if (asyncJobId) {
      const shouldContinue = await shouldJobContinue(systemRepo, asyncJobId);
      if (!shouldContinue) {
        throw new CancelledError('Job cancelled');
      }
    }

    const bundle = await searchPatientCompartment(repo, target, search);
    const found = (bundle.entry ?? EMPTY).flatMap((e) =>
      !e.resource || e.resource.resourceType === 'Patient' ? EMPTY : [{ reference: getReferenceString(e.resource) }]
    );
    // Search results lack fields hidden from the user, so check the stored versions instead
    const resources = await systemRepo.readReferences(found);
    for (const resource of resources) {
      // Skip resources deleted since the search
      if (!(resource instanceof Error)) {
        await lock.renewIfDue();
        const revisited = Date.parse(resource.meta?.lastUpdated ?? '') >= startTime;
        const result = await updateCompartmentResource(repo, target, resource, accounts, removals);
        if (result === 'written' || (result === 'unchanged' && !revisited)) {
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

type CompartmentUpdateResult = 'written' | 'unchanged' | 'skipped';

async function updateCompartmentResource(
  userRepo: Repository,
  target: WithId<Resource>,
  resource: Resource,
  accounts: Reference[],
  removals: Reference[]
): Promise<CompartmentUpdateResult> {
  // The resource was read after the target was updated; skip it if it already has the right accounts.
  const expected = applyAccountChanges(extractAccountReferences(resource.meta), accounts, removals);
  if (hasAccounts(resource, expected)) {
    return userRepo.canPerformInteraction(AccessPolicyInteraction.UPDATE, resource) ? 'unchanged' : 'skipped';
  }

  const { resourceType } = resource;
  const id = resource.id as string;
  await getAuthenticatedContext().fhirRateLimiter?.recordWrite();
  try {
    // Read and write with the system repo to keep fields hidden from the user
    return await userRepo.getSystemRepo().withTransaction<CompartmentUpdateResult>(
      async (txRepo) => {
        const current = await txRepo.readResource(resourceType, id);
        // Skip resources moved out of the target's compartment since the search
        if (
          !isInTargetCompartment(target, current) ||
          !userRepo.canPerformInteraction(AccessPolicyInteraction.UPDATE, current)
        ) {
          return 'skipped';
        }
        const accountList = applyAccountChanges(
          extractAccountReferences(current.meta),
          accounts,
          excludeOtherPatientAccounts(
            target,
            current,
            removals,
            await readOtherPatientAccounts(txRepo, target, current, removals)
          )
        );
        if (hasAccounts(current, accountList)) {
          return 'unchanged';
        }
        current.meta = {
          ...current.meta,
          accounts: accountList,
          account: accountList?.[0],
        };
        await txRepo.updateResource(current);
        return 'written';
      },
      { resourceTypes: [resourceType, 'Patient'], source: 'setAccounts.compartment' }
    );
  } catch (err) {
    if (err instanceof OperationOutcomeError && (isGone(err.outcome) || isNotFound(err.outcome))) {
      return 'skipped';
    }
    throw err;
  }
}

/**
 * Reads the accounts of the other Patients whose compartments contain a resource, if it holds an account
 * being removed, since those Patients may keep the account on the resource.
 * @param systemRepo - The system repository to read with.
 * @param target - The target Patient.
 * @param resource - The compartment resource.
 * @param removals - The accounts being removed.
 * @returns The accounts of each other existing Patient, by reference string.
 */
async function readOtherPatientAccounts(
  systemRepo: SystemRepository,
  target: WithId<Resource>,
  resource: Resource,
  removals: Reference[]
): Promise<Map<string, readonly Reference[]>> {
  const targetRef = getReferenceString(target);
  const patientRefs = extractAccountReferences(resource.meta)?.some((a) =>
    removals.some((r) => r.reference === a.reference)
  )
    ? getPatients(resource).filter((p) => p.reference !== targetRef)
    : EMPTY;
  if (!patientRefs.length) {
    return new Map();
  }

  const patients = await systemRepo.readReferences(patientRefs);
  return new Map(
    patients.flatMap((p) =>
      p instanceof Error ? EMPTY : [[getReferenceString(p), extractAccountReferences(p.meta) ?? EMPTY] as const]
    )
  );
}

function isInTargetCompartment(target: WithId<Resource>, resource: Resource): boolean {
  const targetRef = getReferenceString(target);
  return getPatients(resource).some((p) => p.reference === targetRef);
}

function excludeOtherPatientAccounts(
  target: WithId<Resource>,
  resource: Resource,
  removals: Reference[],
  otherPatientAccounts: Map<string, readonly Reference[]>
): Reference[] {
  // Don't remove any accounts provided by other existing Patients
  const targetRef = getReferenceString(target);
  const retained = getPatients(resource).flatMap((p) =>
    p.reference === targetRef ? EMPTY : (otherPatientAccounts.get(p.reference) ?? EMPTY)
  );
  return removals.filter((r) => !retained.some((a) => a.reference === r.reference));
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

const TARGET_LOCK_TTL_MS = 5 * 60 * 1000;

// Take the lock if it is free or held by an earlier attempt of the same job (token prefix ARGV[3]), so a
// retried job can resume its own run. The earlier attempt then fails its next check and stops.
const ACQUIRE_LOCK_SCRIPT = `local held = redis.call('get', KEYS[1]) if held == false or (ARGV[3] ~= '' and string.sub(held, 1, #ARGV[3]) == ARGV[3]) then return redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2]) end return false`;
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

  static async acquire(resourceType: ResourceType, id: string, asyncJobId?: string): Promise<TargetLock> {
    const key = `medplum:set-accounts:${resourceType}/${id}`;
    // Each attempt has its own token, so an earlier attempt can't renew or release a retry's lock
    const jobPrefix = asyncJobId ? `${asyncJobId}:` : '';
    const token = jobPrefix + randomUUID();
    if ((await getCacheRedis().eval(ACQUIRE_LOCK_SCRIPT, 1, key, token, TARGET_LOCK_TTL_MS, jobPrefix)) !== 'OK') {
      throw new OperationOutcomeError(conflict(`$set-accounts is already running for ${resourceType}/${id}`));
    }
    return new TargetLock(key, token);
  }

  async renewIfDue(): Promise<void> {
    if (Date.now() - this.lastRenewed >= TARGET_LOCK_TTL_MS / 3) {
      await this.renew();
    }
  }

  async renew(): Promise<void> {
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
