// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, getIdentifier, getReferenceString, normalizeErrorString } from '@medplum/core';
import type { Organization, Practitioner, PractitionerRole, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import type { BillingPractitionerFormValues } from '../utils/billing';
import { buildUpdatedPractitioner, withCandidPractitionerExtensions, withCandidProviderId } from '../utils/billing';
import {
  CANDID_CREATE_PROVIDER_BOT_IDENTIFIER,
  CANDID_EDIT_PROVIDER_BOT_IDENTIFIER,
  CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM,
} from '../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../utils/notifications';
import { useCandidBot } from './useCandidBot';
import type { CandidProviderRegistration } from './useCandidProviderRegistration';

/**
 * State and operations for the practitioners claims are rendered by. The list itself is searched by
 * the search control; this hook covers what a search cannot.
 *
 * - `candidBotId` — ID of the candid-create-provider bot; undefined while looking up, '' when not deployed.
 * - `candidEditBotId` — ID of the candid-edit-provider bot, which pushes changes to a provider
 *   Candid already holds; undefined while looking up, '' when not deployed.
 * - `savedVersion` — increments on every successful save, so the list can refetch.
 * - `savePractitioner` — writes the NPI and taxonomy onto the Practitioner, points their active
 *   PractitionerRole at the chosen billing organization (or clears it for individual billing), and,
 *   when the bots are deployed, either registers them with Candid or, when Candid already holds the
 *   provider, pushes the change up to it. Returns the
 *   saved Practitioner, or undefined when the save itself failed; a failed Candid registration
 *   leaves the saved Practitioner in place, unregistered, so saving again retries it.
 */
export interface BillingPractitioners {
  candidBotId: string | undefined;
  candidEditBotId: string | undefined;
  savedVersion: number;
  saving: boolean;
  savePractitioner: (
    practitioner: WithId<Practitioner>,
    fields: BillingPractitionerFormValues,
    billingOrganization: Reference<Organization> | undefined,
    registration: CandidProviderRegistration
  ) => Promise<WithId<Practitioner> | undefined>;
}

export function useBillingPractitioners(): BillingPractitioners {
  const medplum = useMedplum();
  const candidBotId = useCandidBot(CANDID_CREATE_PROVIDER_BOT_IDENTIFIER);
  const candidEditBotId = useCandidBot(CANDID_EDIT_PROVIDER_BOT_IDENTIFIER);
  const [savedVersion, setSavedVersion] = useState(0);
  const [saving, setSaving] = useState(false);

  const registerWithCandid = async (practitioner: WithId<Practitioner>): Promise<void> => {
    try {
      // The bot needs a stored resource: it registers the provider with Candid and stamps the
      // Candid provider ID back onto the Practitioner.
      await medplum.executeBot(candidBotId as string, practitioner, 'application/fhir+json');
      showSuccessNotification({ title: 'Success', message: 'Registered with Candid' });
    } catch (error) {
      showErrorNotification(
        new Error(
          `Practitioner saved, but registering them with Candid failed: ${normalizeErrorString(error)}. ` +
            'Save the practitioner again to retry.'
        )
      );
    }
  };

  const updateInCandid = async (practitioner: WithId<Practitioner>): Promise<void> => {
    try {
      await medplum.executeBot(candidEditBotId as string, practitioner, 'application/fhir+json');
      showSuccessNotification({ title: 'Success', message: 'Updated in Candid' });
    } catch (error) {
      showErrorNotification(
        new Error(
          `Practitioner saved, but updating them in Candid failed: ${normalizeErrorString(error)}. ` +
            'Save the practitioner again to retry.'
        )
      );
    }
  };

  /**
   * Points the practitioner's active role at the chosen billing organization. The role is what the
   * encounter billing tab reads to decide whether a claim bills under an organization, so clearing
   * the organization — rather than deactivating the role — is what switches them to individual
   * billing; the role carries unrelated authorizations that must survive.
   * @param practitioner - The stored practitioner whose role is being pointed.
   * @param billingOrganization - The organization to bill under, or undefined for individual billing.
   */
  const syncBillingRole = async (
    practitioner: WithId<Practitioner>,
    billingOrganization: Reference<Organization> | undefined
  ): Promise<void> => {
    const role = await medplum.searchOne('PractitionerRole', {
      practitioner: getReferenceString(practitioner),
      active: 'true',
    });
    if (billingOrganization) {
      if (role) {
        await medplum.patchResource('PractitionerRole', role.id, [
          { op: role.organization ? 'replace' : 'add', path: '/organization', value: billingOrganization },
        ]);
      } else {
        await medplum.createResource<PractitionerRole>({
          resourceType: 'PractitionerRole',
          active: true,
          practitioner: createReference(practitioner),
          organization: billingOrganization,
        });
      }
    } else if (role?.organization) {
      await medplum.patchResource('PractitionerRole', role.id, [{ op: 'remove', path: '/organization' }]);
    }
  };

  const savePractitioner = async (
    practitioner: WithId<Practitioner>,
    fields: BillingPractitionerFormValues,
    billingOrganization: Reference<Organization> | undefined,
    registration: CandidProviderRegistration
  ): Promise<WithId<Practitioner> | undefined> => {
    setSaving(true);
    try {
      let built = buildUpdatedPractitioner(practitioner, fields);
      built = withCandidProviderId(
        built,
        registration.status === 'registered' ? registration.candidProviderId : undefined
      );
      // Candid holds one provider per NPI: register a new one, and push changes to one it already
      // has. Which applies is decided by the provider identifier, live from Candid when the lookup
      // could answer and from the resource otherwise. The billing flags go on either way, so a move
      // between individual and organization billing reaches Candid.
      const candidProviderId = getIdentifier(built, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM);
      const registering = !candidProviderId && !!candidBotId;
      const updating = !!candidProviderId && !!candidEditBotId;
      if (registering || updating) {
        built = withCandidPractitionerExtensions(built, !billingOrganization);
      }
      const saved = await medplum.updateResource(built as WithId<Practitioner>);
      await syncBillingRole(saved, billingOrganization);
      showSuccessNotification({ title: 'Success', message: 'Billing details updated' });
      if (registering) {
        await registerWithCandid(saved);
      } else if (updating) {
        await updateInCandid(saved);
      }
      setSavedVersion((version) => version + 1);
      return saved;
    } catch (error) {
      showErrorNotification(error);
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  return { candidBotId, candidEditBotId, savedVersion, saving, savePractitioner };
}
