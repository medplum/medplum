// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { Document, ResourceHistoryTable } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';

export function PatientHistory(): JSX.Element {
  const { id } = useParams();
  return (
    <Document>
      <Title order={3} mb="xl">
        Patient History
      </Title>
      <ResourceHistoryTable resourceType="Patient" id={id} />
    </Document>
  );
}
