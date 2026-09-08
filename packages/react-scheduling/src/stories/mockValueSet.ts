// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, ValueSetExpandParams } from '@medplum/core';
import { notFound, OperationOutcomeError } from '@medplum/core';
import type { Coding, ValueSet } from '@medplum/fhirtypes';

/**
 * Answers `ValueSet/$expand` from a fixed set of value sets.
 *
 * `MockClient` answers every expansion with the same three placeholder concepts, which is enough to
 * prove a field is wired up and not enough to prove anything about what it captured. This serves
 * real-looking codes per url, and rejects an unknown url with a 404 the way a server does for a
 * value set nobody imported — the case that decides whether a field is usable at all.
 *
 * @param medplum - The client to patch.
 * @param valueSets - Concepts to offer, keyed by the value set's canonical url.
 * @returns A function restoring the client's own `valueSetExpand`.
 */
export function installValueSetStub(medplum: MedplumClient, valueSets: Record<string, Coding[]>): () => void {
  const original = medplum.valueSetExpand.bind(medplum);

  medplum.valueSetExpand = async function stubbedExpand(params: ValueSetExpandParams): Promise<ValueSet> {
    const concepts = params.url === undefined ? undefined : valueSets[params.url];
    if (!concepts) {
      // What the availability probe reads as "nobody imported this", and the only verdict that
      // takes a field out of use. A transient failure deliberately does not.
      throw new OperationOutcomeError(notFound);
    }

    const filter = params.filter?.toLowerCase();
    const matches = filter
      ? concepts.filter((concept) => `${concept.code} ${concept.display}`.toLowerCase().includes(filter))
      : concepts;
    return {
      resourceType: 'ValueSet',
      status: 'active',
      url: params.url,
      expansion: { timestamp: new Date().toISOString(), contains: matches.slice(0, params.count ?? matches.length) },
    };
  } as MedplumClient['valueSetExpand'];

  return () => {
    medplum.valueSetExpand = original;
  };
}
