// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { SmartHealthLinkImport } from './SmartHealthLinkImport';

export function SmartHealthLinkImportPage(): JSX.Element {
  const navigate = useNavigate();

  return (
    <Document>
      <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
        <Title order={2} fw={800}>
          Import from SMART Health Card or Link
        </Title>
        <Text c="dimmed" size="sm">
          Scan a patient-shared QR code, match the patient, and import selected resources.
        </Text>
      </div>
      <SmartHealthLinkImport
        onImported={(patient) => navigate(`/Patient/${patient.id}/timeline`)?.catch(console.error)}
      />
    </Document>
  );
}
