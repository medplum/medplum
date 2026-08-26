// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Tabs, Title } from '@mantine/core';
import type { Organization } from '@medplum/fhirtypes';
import { Document, LinkTabs } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { ImportedPayerList } from '../../components/billing/ImportedPayerList';
import { PayerDetailsModal } from '../../components/billing/PayerDetailsModal';
import { PayerDirectorySearch } from '../../components/billing/PayerDirectorySearch';
import { useCandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';

// Explicit values keep the URL segments capitalized (/Settings/Billing/Payers); plain string
// tabs would be lowercased.
const TABS = [
  { label: 'Enrolled Payers', value: 'Payers' },
  { label: 'Candid Payer Directory', value: 'Directory' },
];

export function BillingSetupPage(): JSX.Element {
  const directory = useCandidPayerDirectory();
  const [detailsPayer, setDetailsPayer] = useState<Organization | undefined>(undefined);

  return (
    <Document>
      <Stack gap="lg">
        <Title order={1}>Billing Settings</Title>
        <LinkTabs baseUrl="/Settings/Billing" tabs={TABS}>
          <Tabs.Panel value="Payers" pt="md">
            <ImportedPayerList payers={directory.importedPayers} onSelectPayer={setDetailsPayer} />
          </Tabs.Panel>
          <Tabs.Panel value="Directory" pt="md">
            <PayerDirectorySearch directory={directory} onSelectPayer={setDetailsPayer} />
          </Tabs.Panel>
        </LinkTabs>

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
