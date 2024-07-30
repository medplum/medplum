import { Grid, Loader } from '@mantine/core';
import { Document, PatientSummary, useResource } from '@medplum/react';
import { useParams } from 'react-router-dom';
import { PatientDetails } from '../components/PatientDetails';
import { PatientActions } from '../components/PatientActions';
import { Patient } from '@medplum/fhirtypes';

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
