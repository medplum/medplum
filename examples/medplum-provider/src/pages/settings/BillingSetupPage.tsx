// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Tabs, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Organization, Practitioner, Reference } from '@medplum/fhirtypes';
import { Document, LinkTabs } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { BillingOrganizationList } from '../../components/billing/BillingOrganizationList';
import { BillingOrganizationModal } from '../../components/billing/BillingOrganizationModal';
import { BillingPractitionerList } from '../../components/billing/BillingPractitionerList';
import { BillingPractitionerModal } from '../../components/billing/BillingPractitionerModal';
import { ImportedPayerList } from '../../components/billing/ImportedPayerList';
import { PayerDetailsModal } from '../../components/billing/PayerDetailsModal';
import { PayerDirectorySearch } from '../../components/billing/PayerDirectorySearch';
import { useBillingOrganizations } from '../../hooks/useBillingOrganizations';
import { useBillingPractitioners } from '../../hooks/useBillingPractitioners';
import { useCandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';

// Explicit values keep the URL segments capitalized (/Settings/Billing/Payers); plain string
// tabs would be lowercased.
const TABS = [
  { label: 'Billing Organizations', value: 'Organizations' },
  { label: 'Billing Practitioners', value: 'Practitioners' },
  { label: 'Enrolled Payers', value: 'Payers' },
  { label: 'Candid Payer Directory', value: 'Directory' },
];

export function BillingSetupPage(): JSX.Element {
  const billingOrganizations = useBillingOrganizations();
  const billingPractitioners = useBillingPractitioners();
  const directory = useCandidPayerDirectory();
  // An existing organization to edit, or `{}` for a new one; undefined keeps the modal closed.
  const [editingOrganization, setEditingOrganization] = useState<{ organization?: WithId<Organization> } | undefined>(
    undefined
  );
  // The practitioner being edited, with the organization their role already points at.
  const [editingPractitioner, setEditingPractitioner] = useState<
    { practitioner: WithId<Practitioner>; billingOrganization?: Reference<Organization> } | undefined
  >(undefined);
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
          <Tabs.Panel value="Practitioners" pt="md">
            <BillingPractitionerList
              billingPractitioners={billingPractitioners}
              onSelectPractitioner={(practitioner, billingOrganization) =>
                setEditingPractitioner({ practitioner, billingOrganization })
              }
            />
          </Tabs.Panel>
          <Tabs.Panel value="Payers" pt="md">
            <ImportedPayerList directory={directory} onSelectPayer={setDetailsPayer} />
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

        <BillingPractitionerModal
          billingPractitioners={billingPractitioners}
          practitioner={editingPractitioner?.practitioner}
          billingOrganization={editingPractitioner?.billingOrganization}
          onClose={() => setEditingPractitioner(undefined)}
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
