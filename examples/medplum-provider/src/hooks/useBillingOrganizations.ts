// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import type { BillingOrganizationFormValues } from '../utils/billing';
import { buildUpdatedOrganization, withCandidProviderExtensions, withCandidProviderId } from '../utils/billing';
import {
  CANDID_CREATE_PROVIDER_BOT_IDENTIFIER,
  CANDID_EDIT_PROVIDER_BOT_IDENTIFIER,
  CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM,
} from '../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../utils/notifications';
import { useCandidBot } from './useCandidBot';
import type { CandidProviderRegistration } from './useCandidProviderRegistration';

/**
 * State and operations for the billing organizations claims are billed under. The list itself is
 * searched by the search control; this hook covers what a search cannot.
 *
 * - `candidBotId` — ID of the candid-create-provider bot; undefined while looking up, '' when not deployed.
 * - `candidEditBotId` — ID of the candid-edit-provider bot, which pushes changes to a provider
 *   Candid already holds; undefined while looking up, '' when not deployed.
 * - `savedVersion` — increments on every successful save, so the list can refetch.
 * - `saveOrganization` — creates or updates a billing organization from form values and, when the
 *   bots are deployed, either registers it with Candid or, when Candid already holds the provider,
 *   pushes the change up to it. Returns the saved Organization, or undefined when the save itself
 *   failed; a failed Candid call leaves the saved Organization in place, so saving again retries.
 */
export interface BillingOrganizations {
  candidBotId: string | undefined;
  candidEditBotId: string | undefined;
  savedVersion: number;
  saving: boolean;
  saveOrganization: (
    organization: WithId<Organization> | undefined,
    fields: BillingOrganizationFormValues,
    registration: CandidProviderRegistration
  ) => Promise<WithId<Organization> | undefined>;
}

export function useBillingOrganizations(): BillingOrganizations {
  const medplum = useMedplum();
  const candidBotId = useCandidBot(CANDID_CREATE_PROVIDER_BOT_IDENTIFIER);
  const candidEditBotId = useCandidBot(CANDID_EDIT_PROVIDER_BOT_IDENTIFIER);
  const [savedVersion, setSavedVersion] = useState(0);
  const [saving, setSaving] = useState(false);

  const registerWithCandid = async (organization: WithId<Organization>): Promise<void> => {
    try {
      // The bot needs a stored resource: it registers the provider with Candid and stamps the
      // Candid provider ID back onto the Organization.
      await medplum.executeBot(candidBotId as string, organization, 'application/fhir+json');
      showSuccessNotification({ title: 'Success', message: 'Registered with Candid' });
    } catch (error) {
      showErrorNotification(
        new Error(
          `Billing organization saved, but registering it with Candid failed: ${normalizeErrorString(error)}. ` +
            'Save the organization again to retry.'
        )
      );
    }
  };

  const updateInCandid = async (organization: WithId<Organization>): Promise<void> => {
    try {
      await medplum.executeBot(candidEditBotId as string, organization, 'application/fhir+json');
      showSuccessNotification({ title: 'Success', message: 'Updated in Candid' });
    } catch (error) {
      showErrorNotification(
        new Error(
          `Billing organization saved, but updating it in Candid failed: ${normalizeErrorString(error)}. ` +
            'Save the organization again to retry.'
        )
      );
    }
  };

  const saveOrganization = async (
    organization: WithId<Organization> | undefined,
    fields: BillingOrganizationFormValues,
    registration: CandidProviderRegistration
  ): Promise<WithId<Organization> | undefined> => {
    setSaving(true);
    try {
      let built = buildUpdatedOrganization(organization ?? { resourceType: 'Organization' }, fields);
      built = withCandidProviderId(
        built,
        registration.status === 'registered' ? registration.candidProviderId : undefined
      );
      // Candid holds one provider per NPI: register a new one, and push changes to one it already
      // has. Which applies is decided by the provider identifier, live from Candid when the lookup
      // could answer and from the resource otherwise.
      const candidProviderId = getIdentifier(built, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM);
      const registering = !candidProviderId && !!candidBotId;
      const updating = !!candidProviderId && !!candidEditBotId;
      if (registering || updating) {
        built = withCandidProviderExtensions(built);
      }
      const saved = organization
        ? await medplum.updateResource(built as WithId<Organization>)
        : await medplum.createResource(built);
      showSuccessNotification({
        title: 'Success',
        message: organization ? 'Billing organization updated' : 'Billing organization created',
      });
      if (registering) {
        await registerWithCandid(saved);
      } else if (updating) {
        await updateInCandid(saved);
      }
      // The create/update invalidated the client's Organization searches, so the refetch this
      // triggers sees the identifier the registration bot stamps server-side.
      setSavedVersion((version) => version + 1);
      return saved;
    } catch (error) {
      showErrorNotification(error);
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  return { candidBotId, candidEditBotId, savedVersion, saving, saveOrganization };
}
