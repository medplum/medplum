// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum, useSearchOne } from '@medplum/react';
import { useState } from 'react';
import type { BillingOrganizationFormValues } from '../utils/billing';
import { buildUpdatedOrganization, withCandidProviderExtensions, withCandidProviderId } from '../utils/billing';
import {
  CANDID_CREATE_PROVIDER_BOT_IDENTIFIER,
  CANDID_EDIT_PROVIDER_BOT_IDENTIFIER,
  CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM,
} from '../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../utils/notifications';
import type { CandidProviderRegistration } from './useCandidProviderRegistration';

/**
 * Operations for the billing organizations claims are billed under; the list itself is a search control.
 *
 * - `candidBotId` — candid-create-provider bot ID; undefined while looking up, '' when not deployed.
 * - `candidEditBotId` — candid-edit-provider bot ID, which updates a provider Candid already holds; same states.
 * - `savedVersion` — increments on every successful save, so the list can refetch.
 * - `saveOrganization` — saves the form values, then registers with Candid or updates the provider it holds.
 *   Returns the saved Organization, or undefined when the save itself failed; the hook has already shown the
 *   error notification by then, so callers only need to keep their form open. A failed Candid call leaves the
 *   saved Organization in place, so saving again retries it.
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
  const [createBot, , createBotOutcome] = useSearchOne('Bot', {
    identifier: `${CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.system}|${CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.value}`,
  });
  const candidBotId = createBotOutcome === undefined ? undefined : (createBot?.id ?? '');
  const [editBot, , editBotOutcome] = useSearchOne('Bot', {
    identifier: `${CANDID_EDIT_PROVIDER_BOT_IDENTIFIER.system}|${CANDID_EDIT_PROVIDER_BOT_IDENTIFIER.value}`,
  });
  const candidEditBotId = editBotOutcome === undefined ? undefined : (editBot?.id ?? '');
  const [savedVersion, setSavedVersion] = useState(0);
  const [saving, setSaving] = useState(false);

  const registerWithCandid = async (organization: WithId<Organization>): Promise<void> => {
    try {
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
