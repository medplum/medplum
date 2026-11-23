// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, MedplumRequestOptions, WithId } from '@medplum/core';
import { DEFAULT_MAX_SEARCH_COUNT, isReference, normalizeErrorString, resolveId } from '@medplum/core';
import type {
  Bot,
  ClientApplication,
  ExtractResource,
  Project,
  ProjectMembership,
  ResourceType,
  User,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { getProjectId } from '../../utils';
import type { AdminEntry, ClientEntry, SecretRotation, SecurityCheckInput, SecurityFinding } from './checks';
import { analyzeProjectSecurity, listAdmins, listClients } from './checks';
import { saveSecurityReport } from './saveReport';

const NO_CACHE: MedplumRequestOptions = { cache: 'no-cache' };
const USER_ID_CHUNK_SIZE = 100;
const HISTORY_PAGE_SIZE = 100;

export interface SecurityCheckResult {
  readonly checkedAt: Date;
  readonly findings: SecurityFinding[];
  readonly admins: AdminEntry[];
  readonly clients: ClientEntry[];
}

export interface SecurityCheckState {
  readonly loading: boolean;
  readonly result?: SecurityCheckResult;
  readonly error?: string;
  readonly reload: () => void;
}

/**
 * Loads the project's memberships, access policies, staff users and clients, runs the security checks,
 * and saves each result as a report.
 * @returns The loading state, findings, admin and client lists, and a reload callback.
 */
export function useSecurityCheckData(): SecurityCheckState {
  const medplum = useMedplum();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<SecurityCheckResult>();
  const [error, setError] = useState<string>();
  const [runCount, setRunCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    runSecurityCheck(medplum)
      .then(async (r) => {
        if (cancelled) {
          return;
        }
        setResult(r);
        setLoading(false);
        await saveSecurityReport(medplum, r).catch(console.error);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(normalizeErrorString(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [medplum, runCount]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setRunCount((c) => c + 1);
  }, []);

  return { loading, result, error, reload };
}

async function runSecurityCheck(medplum: MedplumClient): Promise<SecurityCheckResult> {
  const projectId = getProjectId(medplum);
  const [projectResult, projectResource, memberships, accessPolicies, clients, bots] = await Promise.all([
    medplum.get<{ project: Project }>(`admin/projects/${projectId}`, NO_CACHE),
    medplum.readResource('Project', projectId, NO_CACHE),
    searchAll(medplum, 'ProjectMembership', { project: `Project/${projectId}` }),
    searchAll(medplum, 'AccessPolicy'),
    searchAll(medplum, 'ClientApplication'),
    searchAll(medplum, 'Bot'),
  ]);

  const staffUserIds = memberships
    .filter((m) => isReference(m.profile, 'Practitioner') && isReference(m.user, 'User'))
    .map((m) => resolveId(m.user))
    .filter((id): id is string => !!id);

  const [users, secretRotations] = await Promise.all([
    searchUsers(medplum, staffUserIds),
    getSecretRotationTimes(medplum, clients),
  ]);

  const input: SecurityCheckInput = {
    project: projectResult.project,
    memberships,
    accessPolicies,
    users,
    secretRotations,
    names: getProfileNames(memberships, clients, bots, users),
    now: new Date(),
  };
  return {
    checkedAt: input.now,
    findings: analyzeProjectSecurity(input),
    admins: listAdmins(memberships, projectResource.owner, input.names),
    clients: listClients(input),
  };
}

/**
 * Loads every matching resource. Sorting by `_lastUpdated` ascending makes the server return cursor links,
 * which are not subject to the search offset limit.
 * @param medplum - The Medplum client.
 * @param resourceType - The resource type to search.
 * @param query - Additional search parameters.
 * @returns All matching resources.
 */
async function searchAll<RT extends ResourceType>(
  medplum: MedplumClient,
  resourceType: RT,
  query?: Record<string, string>
): Promise<WithId<ExtractResource<RT>>[]> {
  const results: WithId<ExtractResource<RT>>[] = [];
  const pagedQuery = { ...query, _sort: '_lastUpdated', _count: String(DEFAULT_MAX_SEARCH_COUNT) };
  for await (const page of medplum.searchResourcePages(resourceType, pagedQuery, NO_CACHE)) {
    results.push(...page);
  }
  return results;
}

/**
 * Maps membership profile references to the profile's current name: the client or Bot name, or the staff User's name.
 * @param memberships - The project's memberships.
 * @param clients - The project's client applications.
 * @param bots - The project's Bots.
 * @param users - The project's staff users.
 * @returns Current names keyed by profile reference string.
 */
function getProfileNames(
  memberships: ProjectMembership[],
  clients: ClientApplication[],
  bots: Bot[],
  users: User[]
): Map<string, string> {
  const names = new Map<string, string>();
  for (const client of clients) {
    if (client.name) {
      names.set(`ClientApplication/${client.id}`, client.name);
    }
  }
  for (const bot of bots) {
    if (bot.name) {
      names.set(`Bot/${bot.id}`, bot.name);
    }
  }
  const usersById = new Map(users.map((u) => [u.id, u]));
  for (const membership of memberships) {
    const user = usersById.get(resolveId(membership.user));
    const name = user && ([user.firstName, user.lastName].filter(Boolean).join(' ') || user.email);
    if (name && membership.profile.reference) {
      names.set(membership.profile.reference, name);
    }
  }
  return names;
}

async function searchUsers(medplum: MedplumClient, ids: string[]): Promise<User[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += USER_ID_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + USER_ID_CHUNK_SIZE));
  }
  const results = await Promise.all(chunks.map((chunk) => searchAll(medplum, 'User', { _id: chunk.join(',') })));
  return results.flat();
}

/**
 * Finds when each client's current secret was set by paging back through its history to the first version holding it.
 * If history runs out, or the server refuses a deeper page, the oldest version seen is used and marked `atLeast`.
 * Clients whose secret is hidden by the current user's access policy are skipped.
 * @param medplum - The Medplum client.
 * @param clients - The project's client applications.
 * @returns Map of ClientApplication reference string to when the current secret was set.
 */
async function getSecretRotationTimes(
  medplum: MedplumClient,
  clients: ClientApplication[]
): Promise<Map<string, SecretRotation>> {
  const result = new Map<string, SecretRotation>();
  await Promise.all(
    clients
      .filter((client) => client.secret)
      .map(async (client) => {
        const rotation = await findSecretRotation(medplum, client);
        if (rotation) {
          result.set(`ClientApplication/${client.id}`, rotation);
        }
      })
  );
  return result;
}

async function findSecretRotation(
  medplum: MedplumClient,
  client: ClientApplication
): Promise<SecretRotation | undefined> {
  let setAt = client.meta?.lastUpdated;
  for (let offset = 0; ; offset += HISTORY_PAGE_SIZE) {
    let entries;
    try {
      const history = await medplum.readHistory(
        'ClientApplication',
        client.id as string,
        { count: HISTORY_PAGE_SIZE, offset },
        NO_CACHE
      );
      entries = history.entry ?? [];
    } catch (err) {
      if (offset === 0) {
        throw err;
      }
      return setAt ? { setAt: new Date(setAt), atLeast: true } : undefined;
    }
    for (const entry of entries) {
      const version = entry.resource;
      if (!version) {
        continue;
      }
      if (version.secret !== client.secret) {
        return setAt ? { setAt: new Date(setAt), atLeast: false } : undefined;
      }
      setAt = version.meta?.lastUpdated ?? setAt;
    }
    if (entries.length < HISTORY_PAGE_SIZE) {
      return setAt ? { setAt: new Date(setAt), atLeast: false } : undefined;
    }
  }
}
