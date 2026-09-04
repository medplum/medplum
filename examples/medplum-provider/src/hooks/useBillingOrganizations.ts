// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { BillingOrganizationFormValues } from '../utils/billing';
import { buildUpdatedOrganization, withCandidProviderExtensions } from '../utils/billing';
import { CANDID_CREATE_PROVIDER_BOT_IDENTIFIER, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM } from '../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../utils/notifications';

/**
 * State and operations for the billing organizations claims are billed under. The list itself is
 * searched by the search control; this hook covers what a search cannot.
 *
 * - `candidBotId` — ID of the candid-create-provider bot; undefined while looking up, '' when not deployed.
 * - `savedVersion` — increments on every successful save, so the list can refetch.
 * - `saveOrganization` — creates or updates a billing organization from form values and, when the
 *   Candid bot is deployed, registers it as a Candid organization provider. Returns the saved
 *   Organization, or undefined when the save itself failed; a failed Candid registration leaves the
 *   saved Organization in place, unregistered, so saving again retries it.
 */
export interface BillingOrganizations {
  candidBotId: string | undefined;
  savedVersion: number;
  saving: boolean;
  saveOrganization: (
    organization: WithId<Organization> | undefined,
    fields: BillingOrganizationFormValues
  ) => Promise<WithId<Organization> | undefined>;
}

export function useBillingOrganizations(): BillingOrganizations {
  const medplum = useMedplum();
  const [candidBotId, setCandidBotId] = useState<string | undefined>(undefined);
  const [savedVersion, setSavedVersion] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    medplum
      .searchOne('Bot', {
        identifier: `${CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.system}|${CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.value}`,
      })
      .then((bot) => setCandidBotId(bot?.id ?? ''))
      .catch(showErrorNotification);
  }, [medplum]);

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

  const saveOrganization = async (
    organization: WithId<Organization> | undefined,
    fields: BillingOrganizationFormValues
  ): Promise<WithId<Organization> | undefined> => {
    setSaving(true);
    try {
      let built = buildUpdatedOrganization(organization ?? { resourceType: 'Organization' }, fields);
      const registerable = !!candidBotId && !getIdentifier(built, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM);
      if (registerable) {
        built = withCandidProviderExtensions(built);
      }
      const saved = organization
        ? await medplum.updateResource(built as WithId<Organization>)
        : await medplum.createResource(built);
      showSuccessNotification({
        title: 'Success',
        message: organization ? 'Billing organization updated' : 'Billing organization created',
      });
      if (registerable) {
        await registerWithCandid(saved);
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

  return { candidBotId, savedVersion, saving, saveOrganization };
}
