import { Grid, Loader } from '@mantine/core';
import { Patient } from '@medplum/fhirtypes';
import { PatientSummary, useResource } from '@medplum/react';
import { useParams } from 'react-router-dom';
import { PatientDetails } from '../components/PatientDetails';

export function ChartingPatientPage(): JSX.Element {
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
      <Grid.Col span={8}>
        <PatientDetails patient={patient} />
      </Grid.Col>
    </Grid>
  );
}
