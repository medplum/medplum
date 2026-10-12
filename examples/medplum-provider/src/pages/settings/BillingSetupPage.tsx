// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { CandidBillingSettings } from '../../components/billing/CandidBillingSettings';
import { useAppNavigate } from '../../hooks/useAppNavigate';

const BASE_URL = '/Settings/Billing';

export function BillingSetupPage(): JSX.Element {
  const { '*': path } = useParams();
  const navigate = useAppNavigate();

  return (
    <Document>
      <Stack gap="lg">
        <Title order={1}>Billing Settings</Title>
        <CandidBillingSettings
          baseUrl={BASE_URL}
          path={path}
          onNavigate={(nextPath) => navigate(`${BASE_URL}/${nextPath}`)}
        />
      </Stack>
    </Document>
  );
}
