// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { Document, ResourceTable, useMedplum } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';

export function ObservationPage(): JSX.Element {
  const medplum = useMedplum();
  const { observationId = '' } = useParams();
  const resource = medplum.readResource('Observation', observationId).read();

  return (
    <Document>
      <Title>Observation</Title>
      <ResourceTable value={resource} ignoreMissingValues />
    </Document>
  );
}
