// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import type { Observation } from '@medplum/fhirtypes';
import { Document, ObservationChart, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';

export function ObservationChartPage(): JSX.Element | null {
  const { id } = useParams() as { id: string };
  const reference = { reference: 'Observation/' + id };
  const observation = useResource(reference) as Observation;

  if (!observation) {
    return (
      <Document>
        <Title>Loading...</Title>
      </Document>
    );
  }

  return (
    <Document>
      <Title>Observation Chart</Title>
      <ObservationChart observation={observation} />
    </Document>
  );
}

