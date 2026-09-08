// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, getIdentifier, getReferenceString, normalizeErrorString } from '@medplum/core';
import type { Organization, Practitioner, PractitionerRole, Reference } from '@medplum/fhirtypes';
import { useMedplum, useSearchOne } from '@medplum/react';
import { useState } from 'react';
import type { BillingPractitionerFormValues } from '../utils/billing';
import { buildUpdatedPractitioner, withCandidPractitionerExtensions, withCandidProviderId } from '../utils/billing';
import {
  CANDID_CREATE_PROVIDER_BOT_IDENTIFIER,
  CANDID_EDIT_PROVIDER_BOT_IDENTIFIER,
  CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM,
} from '../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../utils/notifications';
import type { CandidProviderRegistration } from './useCandidProviderRegistration';

/**
 * Operations for the practitioners claims are rendered by; the list itself is a search control.
 *
 * - `candidBotId` — candid-create-provider bot ID; undefined while looking up, '' when not deployed.
 * - `candidEditBotId` — candid-edit-provider bot ID, which updates a provider Candid already holds; same states.
 * - `savedVersion` — increments on every successful save, so the list can refetch.
 * - `savePractitioner` — writes NPI and taxonomy, points the active PractitionerRole at the billing organization
 *   (or clears it), then registers with or updates Candid. Returns the saved Practitioner, or undefined on failure.
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

  const registerWithCandid = async (practitioner: WithId<Practitioner>): Promise<void> => {
    try {
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
   * Points the practitioner's active role at the billing organization, or clears it for individual billing.
   * The role is cleared rather than deactivated: it carries unrelated authorizations that must survive.
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
