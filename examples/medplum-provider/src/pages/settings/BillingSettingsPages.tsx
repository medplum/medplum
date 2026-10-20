// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { useSearchParams } from 'react-router';
import { CandidBillingOrganizations } from '../../components/billing/CandidBillingOrganizations';
import { CandidBillingPractitioners } from '../../components/billing/CandidBillingPractitioners';
import { CandidImportedPayers } from '../../components/billing/CandidImportedPayers';
import { ChargeItemDefinitions } from '../../components/billing/ChargeItemDefinitions';
import { SettingsPage, SettingsPanel } from '../../components/settings/SettingsLayout';
import { useCandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';

/**
 * The open resource lives in the `id` search param rather than the path, so the settings navbar link stays
 * active while a modal is open and the modal survives a reload.
 * @returns The open resource ID and a setter that updates the URL.
 */
function useResourceIdParam(): [string | undefined, (id?: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  return [searchParams.get('id') ?? undefined, (id) => setSearchParams(id ? { id } : {})];
}

export function BillingOrganizationsSettingsPage(): JSX.Element {
  const [resourceId, setResourceId] = useResourceIdParam();
  return (
    <SettingsPage title="Billing Organizations" description="The organizations you bill under through Candid.">
      <SettingsPanel>
        <CandidBillingOrganizations resourceId={resourceId} onNavigate={setResourceId} />
      </SettingsPanel>
    </SettingsPage>
  );
}

export function BillingPractitionersSettingsPage(): JSX.Element {
  const [resourceId, setResourceId] = useResourceIdParam();
  return (
    <SettingsPage title="Billing Practitioners" description="Rendering and billing providers registered with Candid.">
      <SettingsPanel>
        <CandidBillingPractitioners resourceId={resourceId} onNavigate={setResourceId} />
      </SettingsPanel>
    </SettingsPage>
  );
}

export function BillingPayersSettingsPage(): JSX.Element {
  const [resourceId, setResourceId] = useResourceIdParam();
  const directory = useCandidPayerDirectory();
  return (
    <SettingsPage title="Payers" description="Payers you are enrolled with and can submit claims to.">
      <SettingsPanel>
        <CandidImportedPayers directory={directory} resourceId={resourceId} onNavigate={setResourceId} />
      </SettingsPanel>
    </SettingsPage>
  );
}

export function ChargeItemsSettingsPage(): JSX.Element {
  const [resourceId, setResourceId] = useResourceIdParam();
  return (
    <SettingsPage
      title="Charge Items"
      description="The fee schedule used to price charge items when you code an encounter."
    >
      <SettingsPanel>
        <ChargeItemDefinitions resourceId={resourceId} onNavigate={setResourceId} />
      </SettingsPanel>
    </SettingsPage>
  );
}
