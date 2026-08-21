// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { QueryTypes } from '@medplum/core';
import { getDisplayString } from '@medplum/core';
import type { Bundle, Resource, Schedule } from '@medplum/fhirtypes';
import type { MockClient } from '@medplum/mock';

/** The chained filters `searchScheduleCandidates` sends, by the code that carries them. */
const ACTOR_CHAIN_PREFIX = 'actor:';

/**
 * Answers the chained actor filters out of the in-memory repository.
 *
 * `MemoryRepository` matches a filter by looking its code up in the flat search
 * parameter table, so `actor:Practitioner.name` matches nothing — and returns an
 * empty bundle rather than an error, which would make every test below pass for
 * the wrong reason. The stub lifts the chained filters off the query, lets the
 * repository answer the rest, and applies them to what came back, so these tests
 * still run against the fixtures. It understands only the two filters the search
 * sends, not chained search in general.
 *
 * @param medplum - The client to stub.
 * @returns A function restoring the client's own `search`, for a caller sharing
 *   one client across renders.
 */
export function stubChainedActorSearch(medplum: MockClient): () => void {
  const original = medplum.search;
  const search = medplum.search.bind(medplum);
  medplum.search = (async (resourceType: 'Schedule', query: QueryTypes, options?: object): Promise<Bundle> => {
    // `Object.entries` of a `URLSearchParams` is empty, and `searchResources` hands
    // `search` exactly that — reading keys off the query would drop every filter and
    // answer a narrowed search with everything.
    const params = new URLSearchParams(query as never);
    const criteria = new URLSearchParams();
    const chained: [string, string][] = [];
    for (const [code, value] of params) {
      if (code.startsWith(ACTOR_CHAIN_PREFIX)) {
        chained.push([code.slice(ACTOR_CHAIN_PREFIX.length), value]);
      } else {
        criteria.append(code, value);
      }
    }

    const bundle = await search(resourceType, criteria, options);
    if (chained.length === 0) {
      return bundle;
    }

    const actors = new Map<string, Resource>();
    for (const entry of bundle.entry ?? []) {
      if (entry.search?.mode === 'include' && entry.resource?.id) {
        actors.set(`${entry.resource.resourceType}/${entry.resource.id}`, entry.resource);
      }
    }

    const kept = (bundle.entry ?? []).filter((entry) => {
      const schedule = entry.resource;
      if (entry.search?.mode === 'include' || schedule?.resourceType !== 'Schedule') {
        return true;
      }
      return chained.every(([code, value]) => matchesActorChain(schedule, actors, code, value));
    });

    return { ...bundle, entry: kept };
  }) as never;

  return () => {
    medplum.search = original;
  };
}

/**
 * Tests one `actor:<Type>.<code>` filter against a Schedule's actor.
 * @param schedule - The Schedule the filter narrows.
 * @param actors - The actors the search included, by reference.
 * @param code - The chained code, `<Type>.<param>`.
 * @param value - The value the parameter is filtered on.
 * @returns Whether the Schedule's actor satisfies it.
 */
function matchesActorChain(schedule: Schedule, actors: Map<string, Resource>, code: string, value: string): boolean {
  const [actorType, param] = [code.slice(0, code.indexOf('.')), code.slice(code.indexOf('.') + 1)];
  return (schedule.actor ?? []).some((actor) => {
    const reference = actor.reference;
    if (reference?.split('/')[0] !== actorType) {
      return false;
    }
    const resource = actors.get(reference) as (Resource & { active?: boolean; status?: string }) | undefined;
    if (param === 'active:not') {
      // `:not` compiles to IS DISTINCT FROM, so an actor that never said keeps.
      return String(resource?.active) !== value;
    }
    if (param === 'status:not') {
      return resource?.status !== value;
    }
    // A name search matches a prefix of any part of the name.
    const name = actor.display ?? (resource && getDisplayString(resource)) ?? '';
    return name
      .toLowerCase()
      .split(/\s+/)
      .some((part) => part.startsWith(value.toLowerCase()));
  });
}
