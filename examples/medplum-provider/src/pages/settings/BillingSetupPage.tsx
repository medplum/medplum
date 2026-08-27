// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Tabs, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { Document, LinkTabs } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { BillingOrganizationList } from '../../components/billing/BillingOrganizationList';
import { BillingOrganizationModal } from '../../components/billing/BillingOrganizationModal';
import { ImportedPayerList } from '../../components/billing/ImportedPayerList';
import { PayerDetailsModal } from '../../components/billing/PayerDetailsModal';
import { PayerDirectorySearch } from '../../components/billing/PayerDirectorySearch';
import { useBillingOrganizations } from '../../hooks/useBillingOrganizations';
import { useCandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';

// Explicit values keep the URL segments capitalized (/Settings/Billing/Payers); plain string
// tabs would be lowercased.
const TABS = [
  { label: 'Billing Organizations', value: 'Organizations' },
  { label: 'Enrolled Payers', value: 'Payers' },
  { label: 'Candid Payer Directory', value: 'Directory' },
];

export function BillingSetupPage(): JSX.Element {
  const billingOrganizations = useBillingOrganizations();
  const directory = useCandidPayerDirectory();
  // An existing organization to edit, or `{}` for a new one; undefined keeps the modal closed.
  const [editingOrganization, setEditingOrganization] = useState<{ organization?: WithId<Organization> } | undefined>(
    undefined
  );
  const [detailsPayer, setDetailsPayer] = useState<Organization | undefined>(undefined);

  return (
    <Document>
      <Stack gap="lg">
        <Title order={1}>Billing Settings</Title>
        <LinkTabs baseUrl="/Settings/Billing" tabs={TABS}>
          <Tabs.Panel value="Organizations" pt="md">
            <BillingOrganizationList
              billingOrganizations={billingOrganizations}
              onNewOrganization={() => setEditingOrganization({})}
              onSelectOrganization={(organization) => setEditingOrganization({ organization })}
            />
          </Tabs.Panel>
          <Tabs.Panel value="Payers" pt="md">
            <ImportedPayerList payers={directory.importedPayers} onSelectPayer={setDetailsPayer} />
          </Tabs.Panel>
          <Tabs.Panel value="Directory" pt="md">
            <PayerDirectorySearch directory={directory} onSelectPayer={setDetailsPayer} />
          </Tabs.Panel>
        </LinkTabs>

        <BillingOrganizationModal
          billingOrganizations={billingOrganizations}
          organization={editingOrganization?.organization}
          opened={editingOrganization !== undefined}
          onClose={() => setEditingOrganization(undefined)}
        />

        <PayerDetailsModal
          directory={directory}
          payer={detailsPayer}
          onClose={() => setDetailsPayer(undefined)}
          onPayerUpdated={setDetailsPayer}
        />
      </Stack>
    </Document>
  );
}
