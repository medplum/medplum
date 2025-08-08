// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Grid, Loader } from '@mantine/core';
import { Patient } from '@medplum/fhirtypes';
import { Document, PatientSummary, useResource } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';
import { PatientDetails } from '../components/PatientDetails';
import { PatientActions } from '../components/actions/PatientActions';

export function PatientPage(): JSX.Element {
  const { id } = useParams();

  const patient = useResource<Patient>({ reference: `Patient/${id}` });

  if (!patient) {
    return <Loader />;
  }

  return (
    <Grid>
      <Grid.Col span={4}>
        <PatientSummary patient={patient} />
      </Grid.Col>
      <Grid.Col span={5}>
        <PatientDetails patient={patient} />
      </Grid.Col>
      <Grid.Col span={3}>
        <Document p="xs">
          <PatientActions patient={patient} />
        </Document>
      </Grid.Col>
    </Grid>
  );
}
