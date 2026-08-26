// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Tabs, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { BillingOrganizationList } from '../../components/billing/BillingOrganizationList';
import { PayerList } from '../../components/billing/PayerList';

export function BillingSetupPage(): JSX.Element {
  return (
    <Document>
      <Stack gap="lg">
        <div>
          <Title order={1}>Billing Setup</Title>
          <Text c="dimmed" mt={4}>
            Claims are billed to a payer imported from the payer directory, under a billing provider with an NPI and Tax
            ID. Incomplete entries here will fail at claim submission.
          </Text>
        </div>
        <Tabs defaultValue="billing-providers">
          <Tabs.List>
            <Tabs.Tab value="billing-providers">Billing Providers</Tabs.Tab>
            <Tabs.Tab value="payers">Candid Payer Directory</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="billing-providers" pt="md">
            <BillingOrganizationList />
          </Tabs.Panel>
          <Tabs.Panel value="payers" pt="md">
            <PayerList />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Document>
  );
}
