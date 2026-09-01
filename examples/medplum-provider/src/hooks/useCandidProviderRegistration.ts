// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Organization, Parameters, Practitioner } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { isValidNpi } from '../utils/billing';
import { CANDID_LIST_PROVIDERS_BOT_IDENTIFIER, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM } from '../utils/candid';
import { useCandidBot } from './useCandidBot';

export type ProviderResource = Organization | Practitioner;

// The NPI is looked up as it is typed, so wait for the typing to settle.
const LOOKUP_DEBOUNCE_MS = 400;

/**
 * Whether Candid already knows the provider being edited.
 *
 * - `unavailable` — nothing to ask about: no form open, no complete NPI to look up, or the
 *   candid-list-providers bot is not deployed.
 * - `loading` — the lookup is in flight.
 * - `registered` — Candid has a provider under `npi`; `candidProviderId` is its ID there, which the
 *   resource may not carry yet.
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
 * Asks Candid whether it already has a provider for an NPI, rather than trusting the identifier a
 * past registration stamped locally: the two disagree when a registration succeeded in Candid but
 * its write-back did not, and re-registering that NPI is rejected as a duplicate. The NPI comes
 * from the form rather than the stored resource, so a provider being given one for the first time
 * is checked before the save tries to register it.
 * @param resourceType - The kind of provider being edited; undefined while no form is open.
 * @param npi - The NPI as entered on the form; anything but a complete NPI is not looked up.
 * @returns What Candid knows about this provider.
 */
export function useCandidProviderRegistration(
  resourceType: ProviderResource['resourceType'] | undefined,
  npi: string
): CandidProviderRegistration {
  const medplum = useMedplum();
  const listBotId = useCandidBot(CANDID_LIST_PROVIDERS_BOT_IDENTIFIER);
  const [registration, setRegistration] = useState<CandidProviderRegistration>({ status: 'unavailable' });

  const trimmedNpi = npi.trim();

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
    const timer = setTimeout(() => {
      medplum
        .executeBot(listBotId, { npi: trimmedNpi }, 'application/json')
        .then((result: Parameters) => {
          if (cancelled) {
            return;
          }
          // Candid can hold an individual and an organization provider under one NPI, so match the
          // kind of resource being edited.
          const match = (result?.parameter ?? [])
            .map((parameter) => parameter.resource)
            .find((r): r is ProviderResource => r?.resourceType === resourceType);
          const candidProviderId = match && getIdentifier(match, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM);
          setRegistration(
            candidProviderId
              ? { status: 'registered', candidProviderId, npi: trimmedNpi }
              : { status: 'unregistered' }
          );
        })
        .catch((error) => {
          if (!cancelled) {
            setRegistration({ status: 'failed', message: normalizeErrorString(error) });
          }
        });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [medplum, listBotId, trimmedNpi, resourceType]);

  return registration;
}
