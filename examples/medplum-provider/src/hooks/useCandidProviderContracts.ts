// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { normalizeErrorString } from '@medplum/core';
import type { Contract, Parameters } from '@medplum/fhirtypes';
import { useMedplum, useSearchOne } from '@medplum/react';
import { useEffect, useState } from 'react';
import { CANDID_GET_CONTRACTS_BOT_IDENTIFIER, isContractInForce } from '../utils/candid';

/** Candid pages contract searches; one page of this size covers any real provider's effective contracts. */
const CONTRACT_PAGE_SIZE = 100;

/**
 * What Candid holds in the way of payer contracts for a contracting provider.
 *
 * - `unavailable` — no contracting provider to look up, or the candid-get-contracts bot is not deployed.
 * - `loading` — the lookup is in flight.
 * - `contracted` — Candid holds at least one contract that is effective today; `contracts` are those.
 * - `uncontracted` — Candid knows the provider but none of its contracts is in force today.
 * - `failed` — the lookup itself failed, so contract state is unknown.
 */
export type CandidProviderContracts =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'contracted'; contracts: Contract[] }
  | { status: 'uncontracted' }
  | { status: 'failed'; message: string };

/**
 * Asks Candid for the effective payer contracts of a contracting provider. Contracts belong to the billing
 * provider, so a practitioner billing under an organization passes the organization's Candid provider ID.
 * @param contractingProviderId - The Candid organization provider ID to look up; undefined while unknown.
 * @returns The provider's contract state as Candid reports it.
 */
export function useCandidProviderContracts(contractingProviderId: string | undefined): CandidProviderContracts {
  const medplum = useMedplum();
  const [contractsBot, , contractsBotOutcome] = useSearchOne('Bot', {
    identifier: `${CANDID_GET_CONTRACTS_BOT_IDENTIFIER.system}|${CANDID_GET_CONTRACTS_BOT_IDENTIFIER.value}`,
  });
  const contractsBotId = contractsBotOutcome === undefined ? undefined : (contractsBot?.id ?? '');
  const [lookup, setLookup] = useState<{ contractingProviderId: string; result: CandidProviderContracts }>();

  useEffect(() => {
    if (!contractsBotId || !contractingProviderId) {
      return undefined;
    }

    let cancelled = false;
    medplum
      .executeBot(
        contractsBotId,
        { contractingProviderId, contractStatus: 'effective', limit: CONTRACT_PAGE_SIZE },
        'application/json'
      )
      .then((result: Parameters) => {
        if (cancelled) {
          return;
        }
        const inForce = (result?.parameter ?? [])
          .filter((parameter) => parameter.name === 'contract')
          .map((parameter) => parameter.resource)
          .filter((r): r is Contract => r?.resourceType === 'Contract')
          .filter((contract) => isContractInForce(contract));
        setLookup({
          contractingProviderId,
          result: inForce.length > 0 ? { status: 'contracted', contracts: inForce } : { status: 'uncontracted' },
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setLookup({ contractingProviderId, result: { status: 'failed', message: normalizeErrorString(error) } });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [medplum, contractsBotId, contractingProviderId]);

  if (!contractsBotId || !contractingProviderId) {
    return { status: 'unavailable' };
  }
  if (lookup?.contractingProviderId !== contractingProviderId) {
    return { status: 'loading' };
  }
  return lookup.result;
}
