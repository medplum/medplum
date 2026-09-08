// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDebouncedValue } from '@mantine/hooks';
import { getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Organization, Parameters, Practitioner } from '@medplum/fhirtypes';
import { useMedplum, useSearchOne } from '@medplum/react';
import { useEffect, useState } from 'react';
import { isValidNpi } from '../utils/billing';
import { CANDID_LIST_PROVIDERS_BOT_IDENTIFIER, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM } from '../utils/candid';

export type ProviderResource = Organization | Practitioner;

/** The NPI is looked up as it is typed, so wait for the typing to settle. */
const LOOKUP_DEBOUNCE_MS = 400;

/**
 * Whether Candid already knows the provider being edited.
 *
 * - `unavailable` — no form open, no complete NPI to look up, or the candid-list-providers bot is not deployed.
 * - `loading` — the lookup is in flight.
 * - `registered` — Candid holds a provider under `npi`; `candidProviderId` is its ID, maybe not yet on the resource.
 * - `unregistered` — Candid has no provider with this NPI.
 * - `failed` — the lookup itself failed, so registration state is unknown.
 */
export type CandidProviderRegistration =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'registered'; candidProviderId: string; npi: string }
  | { status: 'unregistered' }
  | { status: 'failed'; message: string };

/**
 * Asks Candid whether it already holds a provider for the NPI on the form, instead of trusting a locally
 * stamped identifier: a registration whose write-back failed would otherwise be re-registered and rejected.
 * @param resourceType - The kind of provider being edited; undefined while no form is open.
 * @param npi - The NPI as entered on the form; anything but a complete NPI is not looked up.
 * @returns What Candid knows about this provider.
 */
export function useCandidProviderRegistration(
  resourceType: ProviderResource['resourceType'] | undefined,
  npi: string
): CandidProviderRegistration {
  const medplum = useMedplum();
  const [listBot, , listBotOutcome] = useSearchOne('Bot', {
    identifier: `${CANDID_LIST_PROVIDERS_BOT_IDENTIFIER.system}|${CANDID_LIST_PROVIDERS_BOT_IDENTIFIER.value}`,
  });
  const listBotId = listBotOutcome === undefined ? undefined : (listBot?.id ?? '');
  const [registration, setRegistration] = useState<CandidProviderRegistration>({ status: 'unavailable' });

  const [trimmedNpi] = useDebouncedValue(npi.trim(), LOOKUP_DEBOUNCE_MS);

  useEffect(() => {
    if (listBotId === undefined) {
      return undefined;
    }
    if (!listBotId || !resourceType || !isValidNpi(trimmedNpi)) {
      setRegistration({ status: 'unavailable' });
      return undefined;
    }

    let cancelled = false;
    setRegistration({ status: 'loading' });
    medplum
      .executeBot(listBotId, { npi: trimmedNpi }, 'application/json')
      .then((result: Parameters) => {
        if (cancelled) {
          return;
        }
        const match = (result?.parameter ?? [])
          .map((parameter) => parameter.resource)
          .find((r): r is ProviderResource => r?.resourceType === resourceType);
        const candidProviderId = match && getIdentifier(match, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM);
        setRegistration(
          candidProviderId ? { status: 'registered', candidProviderId, npi: trimmedNpi } : { status: 'unregistered' }
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setRegistration({ status: 'failed', message: normalizeErrorString(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [medplum, listBotId, trimmedNpi, resourceType]);

  return registration;
}
