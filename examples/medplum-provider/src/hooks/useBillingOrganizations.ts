// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { BillingOrganizationFormValues } from '../utils/billing';
import {
  BILLING_ORGANIZATION_IDENTIFIER_VALUE,
  MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM,
  buildUpdatedOrganization,
  withCandidProviderExtensions,
} from '../utils/billing';
import { CANDID_CREATE_PROVIDER_BOT_IDENTIFIER, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM } from '../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../utils/notifications';

const PAGE_SIZE = 10;

/**
 * State and operations for the billing organizations claims are billed under.
 *
 * - `organizations` — one page of the project's billing organizations, recognized by the
 *   provider-app marker identifier.
 * - `page` / `pageCount` — 1-based current page and the number of pages the search reports.
 * - `candidBotId` — ID of the candid-create-provider bot; undefined while looking up, '' when not deployed.
 * - `saveOrganization` — creates or updates a billing organization from form values and, when the
 *   Candid bot is deployed, registers it as a Candid organization provider. Returns the saved
 *   Organization, or undefined when the save itself failed; a failed Candid registration leaves the
 *   saved Organization in place, unregistered, so saving again retries it.
 */
export interface BillingOrganizations {
  organizations: WithId<Organization>[];
  page: number;
  pageCount: number;
  setPage: (pageNumber: number) => void;
  candidBotId: string | undefined;
  saving: boolean;
  saveOrganization: (
    organization: WithId<Organization> | undefined,
    fields: BillingOrganizationFormValues
  ) => Promise<WithId<Organization> | undefined>;
}

export function useBillingOrganizations(): BillingOrganizations {
  const medplum = useMedplum();
  const [organizations, setOrganizations] = useState<WithId<Organization>[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [reload, setReload] = useState(0);
  const [candidBotId, setCandidBotId] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Filter on the marker identifier stamped by saveOrganization, not on organization type:
    // projects can hold hundreds of unrelated Organizations. No NPI filter — an organization
    // missing its NPI must stay visible here so it can be fixed.
    // The create/update in saveOrganization invalidates the client's Organization searches, so this
    // refetch sees the identifier the registration bot stamps server-side.
    medplum
      .searchResources('Organization', {
        identifier: `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`,
        _count: `${PAGE_SIZE}`,
        _offset: `${(page - 1) * PAGE_SIZE}`,
        _sort: 'name',
        _total: 'accurate',
      })
      .then((result) => {
        // bundle.total is absent when the server did not honor _total; the page length is then the
        // only count available, which collapses the control to a single page.
        const count = result.bundle?.total ?? result.length;
        setTotal(count);
        const lastPage = Math.max(Math.ceil(count / PAGE_SIZE), 1);
        if (page > lastPage) {
          // The page fell off the end (organizations removed, or a stale page after a refetch)
          setPage(lastPage);
          return;
        }
        setOrganizations(result);
      })
      .catch(showErrorNotification);
  }, [medplum, page, reload]);

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
      setReload((r) => r + 1);
      return saved;
    } catch (error) {
      showErrorNotification(error);
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  return {
    organizations,
    page,
    pageCount: Math.ceil(total / PAGE_SIZE),
    setPage,
    candidBotId,
    saving,
    saveOrganization,
  };
}
