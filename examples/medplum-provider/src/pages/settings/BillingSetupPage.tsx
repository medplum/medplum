// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { PayerList } from '../../components/billing/PayerList';

export function BillingSetupPage(): JSX.Element {
  return (
    <Document>
      <Stack gap="lg">
        <Title order={1}>Candid Payer Directory</Title>
        <PayerList />
      </Stack>
    </Document>
  );
}
