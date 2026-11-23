// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, MedplumRequestOptions, QueryTypes, WithId } from '@medplum/core';
import { normalizeErrorString, resolveId } from '@medplum/core';
import type { ClientApplication, ExtractResource, Project, ResourceType, User } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { getProjectId } from '../../utils';
import type { AdminEntry, ClientEntry, SecretRotation, SecurityCheckInput, SecurityFinding } from './checks';
import { analyzeProjectSecurity, listAdmins, listClients } from './checks';

const NO_CACHE: MedplumRequestOptions = { cache: 'no-cache' };
const USER_ID_CHUNK_SIZE = 100;
const HISTORY_PAGE_SIZE = 100;

export interface SecurityCheckResult {
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
 * Loads the project's memberships, access policies, staff users and clients, then runs the security checks.
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
      .then((r) => !cancelled && setResult(r))
      .catch((err) => !cancelled && setError(normalizeErrorString(err)))
      .finally(() => !cancelled && setLoading(false));
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
  const [projectResult, projectResource, memberships, accessPolicies, clients] = await Promise.all([
    medplum.get<{ project: Project }>(`admin/projects/${projectId}`, NO_CACHE),
    medplum.readResource('Project', projectId, NO_CACHE),
    searchAll(medplum, 'ProjectMembership', { project: `Project/${projectId}` }),
    searchAll(medplum, 'AccessPolicy'),
    searchAll(medplum, 'ClientApplication'),
  ]);

  const staffUserIds = memberships
    .filter((m) => m.profile.reference?.startsWith('Practitioner/') && m.user.reference?.startsWith('User/'))
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
    now: new Date(),
  };
  return {
    findings: analyzeProjectSecurity(input),
    admins: listAdmins(memberships, projectResource.owner),
    clients: listClients(input),
  };
}

async function searchAll<RT extends ResourceType>(
  medplum: MedplumClient,
  resourceType: RT,
  query?: QueryTypes
): Promise<WithId<ExtractResource<RT>>[]> {
  const results: WithId<ExtractResource<RT>>[] = [];
  for await (const page of medplum.searchResourcePages(resourceType, query, NO_CACHE)) {
    results.push(...page);
  }
  return results;
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
