// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CandidBillingSettings } from '../../components/billing/CandidBillingSettings';

const BASE_URL = '/Settings/Billing';

export function BillingSetupPage(): JSX.Element {
  const { '*': path } = useParams();
  const navigate = useNavigate();

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
