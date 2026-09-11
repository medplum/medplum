// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Tabs, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Organization, Practitioner, Reference } from '@medplum/fhirtypes';
import { Document, LinkTabs, useSearchOne } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { BillingOrganizationList } from '../../components/billing/BillingOrganizationList';
import { BillingOrganizationModal } from '../../components/billing/BillingOrganizationModal';
import { BillingPractitionerList } from '../../components/billing/BillingPractitionerList';
import { BillingPractitionerModal } from '../../components/billing/BillingPractitionerModal';
import { ImportedPayerList } from '../../components/billing/ImportedPayerList';
import { PayerDetailsModal } from '../../components/billing/PayerDetailsModal';
import { PayerDirectorySearch } from '../../components/billing/PayerDirectorySearch';
import { useCandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { CANDID_CREATE_PROVIDER_BOT_IDENTIFIER, CANDID_EDIT_PROVIDER_BOT_IDENTIFIER } from '../../utils/candid';

// Explicit values keep the URL segments capitalized (/Settings/Billing/Payers); plain string
// tabs would be lowercased.
const TABS = [
  { label: 'Billing Organizations', value: 'Organizations' },
  { label: 'Billing Practitioners', value: 'Practitioners' },
  { label: 'Enrolled Payers', value: 'Payers' },
  { label: 'Candid Payer Directory', value: 'Directory' },
];

export function BillingSetupPage(): JSX.Element {
  const [createBot] = useSearchOne('Bot', {
    identifier: `${CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.system}|${CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.value}`,
  });
  const [editBot] = useSearchOne('Bot', {
    identifier: `${CANDID_EDIT_PROVIDER_BOT_IDENTIFIER.system}|${CANDID_EDIT_PROVIDER_BOT_IDENTIFIER.value}`,
  });
  const [organizationsVersion, setOrganizationsVersion] = useState(0);
  const [practitionersVersion, setPractitionersVersion] = useState(0);
  const directory = useCandidPayerDirectory();
  const [editingOrganization, setEditingOrganization] = useState<{ organization?: WithId<Organization> } | undefined>(
    undefined
  );
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
              candidBotId={createBot?.id}
              savedVersion={organizationsVersion}
              onNewOrganization={() => setEditingOrganization({})}
              onSelectOrganization={(organization) => setEditingOrganization({ organization })}
            />
          </Tabs.Panel>
          <Tabs.Panel value="Practitioners" pt="md">
            <BillingPractitionerList
              savedVersion={practitionersVersion}
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
          candidBotId={createBot?.id}
          candidEditBotId={editBot?.id}
          organization={editingOrganization?.organization}
          opened={editingOrganization !== undefined}
          onClose={() => setEditingOrganization(undefined)}
          onSaved={() => setOrganizationsVersion((version) => version + 1)}
        />

        <BillingPractitionerModal
          candidBotId={createBot?.id}
          candidEditBotId={editBot?.id}
          practitioner={editingPractitioner?.practitioner}
          billingOrganization={editingPractitioner?.billingOrganization}
          onClose={() => setEditingPractitioner(undefined)}
          onSaved={() => setPractitionersVersion((version) => version + 1)}
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
