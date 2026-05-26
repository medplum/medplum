// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, Operator, parseSearchRequest } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { NIL } from 'uuid';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { DatabaseMode } from '../database';
import { createTestProject, withTestContext } from '../test.setup';
import type { Repository } from './repo';

type MemberKind = 'method' | 'getter' | 'setter';

/**
 * Methods that are intentionally not guarded by assertUsable().
 *
 * The remainder of public methods/getters/setters on Repository and inherited concrete
 * methods on FhirRepository MUST call assertUsable() at their entry point so that
 * operations on the parent repository fail while a transaction callback is active.
 */
const unguardedMembers = new Set<PropertyKey>([
  'constructor',
  'effectiveAccessPolicy',
  'mode',
  'shardId',
  'currentProject',
  'getConfig',
  'isSuperAdmin',
  'isProjectAdmin',
  'supportsRangeSearch',
  'supportsInteraction',
  'canPerformInteraction',
  'getAuthor',
  'removeHiddenFields',
  'generateId',
  'addDeletedFilter',
  'addSecurityFilters',
]);

/**
 * Private methods on Repository need not be guarded. Listing them explicitly forces
 * any new method added to Repository to be classified as guarded, unguarded, or private.
 */
const knownPrivateMembers = new Set<PropertyKey>([
  'rateLimiter',
  'resourceCap',
  'getProjectById',
  'readResourceImpl',
  'readResourceFromDatabase',
  'processReadReferenceEntry',
  'checkResourcePermissions',
  'updateResourceImpl',
  'handleBinaryUpdate',
  'handleBinaryData',
  'handleStorage',
  'writeToDatabase',
  'checkExistingResource',
  'isNotModified',
  'getPermittedProjectIds',
  'addProjectFilters',
  'addAccessPolicyFilters',
  'writeResource',
  'batchWriteResources',
  'writeResourceVersion',
  'getCompartments',
  'writeLookupTables',
  'batchWriteLookupTables',
  'deleteFromLookupTables',
  'getLastUpdated',
  'getProjectId',
  'getAccounts',
  'canSetId',
  'canWriteProtectedMeta',
  'canWriteAccount',
  'isResourceWriteable',
  'isCacheOnly',
  'restoreReadonlyFields',
  'logEvent',
  'getCacheEntry',
  'getCacheEntries',
  'setCacheEntry',
  'deleteCacheEntry',
  'deleteCacheEntries',
  'createTransactionScopedRepo',
  'assertUsable',
]);

interface MethodInvocation {
  name: PropertyKey;
  kind: MemberKind;
  invoke: (repo: Repository) => unknown;
}

const patient: WithId<Patient> = { resourceType: 'Patient', id: NIL };

/**
 * Representative invocations for each guarded public method/getter/setter. Each invocation
 * must reach the assertUsable() guard before performing any real work, so the parent repo
 * is rejected during a transaction callback regardless of argument validity.
 */
const guardedInvocations: MethodInvocation[] = [
  // Connection / transaction helpers
  { name: 'clone', kind: 'method', invoke: (repo) => repo.clone() },
  { name: 'getSystemRepo', kind: 'method', invoke: (repo) => repo.getSystemRepo() },
  { name: 'setMode', kind: 'method', invoke: (repo) => repo.setMode('reader') },
  { name: 'getDatabaseClient', kind: 'method', invoke: (repo) => repo.getDatabaseClient(DatabaseMode.WRITER) },
  { name: 'withTransaction', kind: 'method', invoke: (repo) => repo.withTransaction(async () => undefined) },
  {
    name: 'withStatementTimeout',
    kind: 'method',
    invoke: (repo) => repo.withStatementTimeout({ timeoutMs: 1 }, async () => undefined),
  },
  { name: 'preCommit', kind: 'method', invoke: (repo) => repo.preCommit(async () => undefined) },
  { name: 'postCommit', kind: 'method', invoke: (repo) => repo.postCommit(async () => undefined) },
  { name: 'ensureInTransaction', kind: 'method', invoke: (repo) => repo.ensureInTransaction(async () => undefined) },

  // Reads
  {
    name: 'readResource',
    kind: 'method',
    invoke: (repo) => repo.readResource<Patient>('Patient', patient.id),
  },
  {
    name: 'readReference',
    kind: 'method',
    invoke: (repo) => repo.readReference<Patient>(createReference<Patient>(patient)),
  },
  {
    name: 'readReferences',
    kind: 'method',
    invoke: (repo) => repo.readReferences<Patient>([createReference<Patient>(patient)]),
  },
  {
    name: 'readHistory',
    kind: 'method',
    invoke: (repo) => repo.readHistory<Patient>('Patient', patient.id),
  },
  {
    name: 'readVersion',
    kind: 'method',
    invoke: (repo) => repo.readVersion<Patient>('Patient', patient.id, NIL),
  },

  // Writes
  {
    name: 'createResource',
    kind: 'method',
    invoke: (repo) => repo.createResource<Patient>({ resourceType: 'Patient' }),
  },
  {
    name: 'updateResource',
    kind: 'method',
    invoke: (repo) => repo.updateResource<Patient>(patient),
  },
  {
    name: 'patchResource',
    kind: 'method',
    invoke: (repo) => repo.patchResource<Patient>('Patient', patient.id, []),
  },
  {
    name: 'deleteResource',
    kind: 'method',
    invoke: (repo) => repo.deleteResource('Patient', patient.id),
  },
  {
    name: 'reindexResource',
    kind: 'method',
    invoke: (repo) => repo.reindexResource<Patient>('Patient', patient.id),
  },
  { name: 'reindexResources', kind: 'method', invoke: (repo) => repo.reindexResources<Patient>([]) },
  {
    name: 'resendSubscriptions',
    kind: 'method',
    invoke: (repo) => repo.resendSubscriptions('Patient', patient.id),
  },
  {
    name: 'expungeResource',
    kind: 'method',
    invoke: (repo) => repo.expungeResource('Patient', patient.id),
  },
  { name: 'expungeResources', kind: 'method', invoke: (repo) => repo.expungeResources('Patient', []) },
  {
    name: 'purgeResources',
    kind: 'method',
    invoke: (repo) => repo.purgeResources('Patient', new Date().toISOString()),
  },

  // Search
  {
    name: 'search',
    kind: 'method',
    invoke: (repo) => repo.search<Patient>(parseSearchRequest('Patient')),
  },
  {
    name: 'processAllResources',
    kind: 'method',
    invoke: (repo) => repo.processAllResources<Patient>(parseSearchRequest('Patient'), async () => undefined),
  },
  {
    name: 'searchByReference',
    kind: 'method',
    invoke: (repo) => repo.searchByReference<Patient>(parseSearchRequest('Patient'), 'subject', []),
  },

  // Inherited FhirRepository helpers
  { name: 'searchOne', kind: 'method', invoke: (repo) => repo.searchOne<Patient>(parseSearchRequest('Patient')) },
  {
    name: 'searchResources',
    kind: 'method',
    invoke: (repo) => repo.searchResources<Patient>(parseSearchRequest('Patient')),
  },
  {
    name: 'conditionalCreate',
    kind: 'method',
    invoke: (repo) =>
      repo.conditionalCreate<Patient>(
        { resourceType: 'Patient' },
        {
          resourceType: 'Patient',
          filters: [{ code: '_id', operator: Operator.EQUALS, value: patient.id }],
        }
      ),
  },
  {
    name: 'conditionalUpdate',
    kind: 'method',
    invoke: (repo) =>
      repo.conditionalUpdate<Patient>(patient, {
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: patient.id }],
      }),
  },
  {
    name: 'conditionalDelete',
    kind: 'method',
    invoke: (repo) =>
      repo.conditionalDelete({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: patient.id }],
      }),
  },
  {
    name: 'conditionalPatch',
    kind: 'method',
    invoke: (repo) =>
      repo.conditionalPatch(
        {
          resourceType: 'Patient',
          filters: [{ code: '_id', operator: Operator.EQUALS, value: patient.id }],
        },
        []
      ),
  },

  // Disposal
  { name: Symbol.dispose, kind: 'method', invoke: (repo) => repo[Symbol.dispose]() },
];

describe('Repository transaction-scoped guarded methods', () => {
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    repo = (await createTestProject({ withRepo: true })).repo;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('every public Repository / inherited FhirRepository member is classified', () => {
    const allMembers = collectPublicMembers(repo);

    // Aggregate prototype members keyed by name; the value records which kinds (method,
    // getter, setter) are present so the same Map can answer both "does this exact
    // (name, kind) exist?" and "does this name exist at all?".
    const memberKinds = new Map<PropertyKey, Set<MemberKind>>();
    for (const member of allMembers) {
      let kinds = memberKinds.get(member.name);
      if (!kinds) {
        kinds = new Set();
        memberKinds.set(member.name, kinds);
      }
      kinds.add(member.kind);
    }

    // Every public prototype member must appear in exactly one classification bucket.
    const unclassified: { source: string; key: string; kind: MemberKind }[] = [];
    const guardedKeys = new Set<string>();
    for (const entry of guardedInvocations) {
      guardedKeys.add(memberKey(entry.name, entry.kind));
    }
    for (const member of allMembers) {
      if (guardedKeys.has(memberKey(member.name, member.kind))) {
        continue;
      }
      if (unguardedMembers.has(member.name)) {
        continue;
      }
      if (knownPrivateMembers.has(member.name)) {
        continue;
      }
      unclassified.push({ source: member.source, key: member.name.toString(), kind: member.kind });
    }

    // Each classification entry must reference a real prototype member, so renames or
    // deletions invalidate stale bookkeeping in this file.
    const strayGuarded: string[] = [];
    for (const entry of guardedInvocations) {
      if (!memberKinds.get(entry.name)?.has(entry.kind)) {
        strayGuarded.push(memberKey(entry.name, entry.kind));
      }
    }
    const strayPrivate: string[] = [];
    for (const name of knownPrivateMembers) {
      if (!memberKinds.has(name)) {
        strayPrivate.push(name.toString());
      }
    }
    const strayUnguarded: string[] = [];
    for (const name of unguardedMembers) {
      if (!memberKinds.has(name)) {
        strayUnguarded.push(name.toString());
      }
    }

    expect(unclassified).toEqual([]);
    expect(strayGuarded).toEqual([]);
    expect(strayPrivate).toEqual([]);
    expect(strayUnguarded).toEqual([]);
  });

  describe('guarded methods reject the parent repo inside withTransaction', () => {
    test.each(guardedInvocations.map((entry) => [String(entry.name), entry] as const))('%s', (_label, entry) =>
      withTestContext(async () => {
        let observedError: unknown;
        await repo.withTransaction(async () => {
          try {
            // eslint-disable-next-line medplum/no-transaction-callback-invoking-repo -- Verifies parent repo rejection.
            const result = entry.invoke(repo);
            if (result instanceof Promise) {
              await result;
            }
          } catch (err) {
            observedError = err;
          }
        });
        expect(observedError).toBeInstanceOf(Error);
        expect((observedError as Error).message).toContain('transaction-scoped repository');
      })
    );
  });

  test('closed repository rejects guarded operations', () =>
    withTestContext(async () => {
      const cloned = repo.clone();
      cloned[Symbol.dispose]();

      expect(() => cloned.getDatabaseClient(DatabaseMode.WRITER)).toThrow('Already closed');
      await expect(cloned.createResource<Patient>({ resourceType: 'Patient' })).rejects.toThrow('Already closed');
      await expect(cloned.withTransaction(async () => undefined)).rejects.toThrow('Already closed');
    }));
});

function memberKey(name: PropertyKey, kind: MemberKind): string {
  return `${kind}:${name.toString()}`;
}

interface DiscoveredMember {
  name: PropertyKey;
  kind: MemberKind;
  source: string;
}

/**
 * Walks the prototype chain from the given instance toward Object.prototype, collecting
 * every public method, getter, and setter. A member defined on a more-derived prototype
 * shadows one with the same name on a parent prototype.
 * @param instance - The instance whose prototype chain should be enumerated.
 * @returns The set of public members reachable from the instance.
 */
function collectPublicMembers(instance: object): DiscoveredMember[] {
  const result: DiscoveredMember[] = [];
  const seen = new Set<PropertyKey>();
  let prototype = Object.getPrototypeOf(instance);
  while (prototype && prototype !== Object.prototype) {
    const source = (prototype.constructor as { name: string }).name;
    const additionsThisLevel: PropertyKey[] = [];
    for (const key of Reflect.ownKeys(prototype)) {
      if (seen.has(key)) {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      if (!descriptor) {
        throw new Error(`Missing descriptor for ${key.toString()}`);
      }
      if (typeof descriptor.value === 'function') {
        result.push({ name: key, kind: 'method', source });
      }
      if (typeof descriptor.get === 'function') {
        result.push({ name: key, kind: 'getter', source });
      }
      if (typeof descriptor.set === 'function') {
        result.push({ name: key, kind: 'setter', source });
      }
      additionsThisLevel.push(key);
    }
    // Defer marking names as seen until the level is fully processed so that getter and
    // setter declared on the same prototype both make it into the result.
    for (const key of additionsThisLevel) {
      seen.add(key);
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  return result;
}
