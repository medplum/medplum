// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * Reads everything a configuration surface lists, as opposed to what booking may offer. The booking searches
 * leave out deactivated and unconfigured resources because nobody can book them; an administrator comes
 * looking for exactly those, to finish configuring or to turn back on.
 */
import type { MedplumClient, WithId } from '@medplum/core';
import type { Bundle, HealthcareService } from '@medplum/fhirtypes';

// Set explicitly: left unset, `searchResourcePages` asks for 1000 at a time, so nothing renders until one
// slow page lands.
const DEFAULT_PAGE_SIZE = 200;

const DEFAULT_LIMIT = 2000;

export interface ConfigSearchOptions {
  readonly signal?: AbortSignal;
  /** How many resources to read per request. Defaults to 200. */
  readonly pageSize?: number;
  /** The most resources to read. Reading stops there and the result reports itself incomplete. Defaults to 2000. */
  readonly limit?: number;
}

export interface ConfigurableServicesResult {
  /** The visit types found, by name. */
  readonly services: WithId<HealthcareService>[];
  /** False when `limit` stopped the read with more left, so this is a prefix of the project rather than all of it. */
  readonly complete: boolean;
}

/**
 * Finds every visit type a project holds, including deactivated ones and ones with no scheduling parameters.
 * The search behind `AppointmentServiceSelect` drops both, since neither can be booked.
 * @param medplum - The Medplum client.
 * @param options - An abort signal, and the read's bounds.
 * @returns The visit types by name, and whether the read reached the end.
 */
export async function searchConfigurableServices(
  medplum: MedplumClient,
  options: ConfigSearchOptions = {}
): Promise<ConfigurableServicesResult> {
  const { signal, pageSize = DEFAULT_PAGE_SIZE, limit = DEFAULT_LIMIT } = options;
  const services: WithId<HealthcareService>[] = [];

  const pages = medplum.searchResourcePages(
    'HealthcareService',
    { _sort: 'name', _count: pageSize.toString() },
    { signal }
  );
  for await (const page of pages) {
    signal?.throwIfAborted();
    services.push(...page);
    if (services.length >= limit) {
      return { services: services.slice(0, limit), complete: !hasMore(services.length, limit, page.bundle) };
    }
  }

  return { services, complete: true };
}

// Reading exactly `limit` is only a prefix when something was left over, either on the page just read or
// behind the next one.
function hasMore(read: number, limit: number, bundle: Bundle): boolean {
  return read > limit || !!bundle.link?.some((link) => link.relation === 'next');
}
