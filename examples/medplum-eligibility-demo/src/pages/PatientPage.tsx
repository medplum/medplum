import { Grid, Loader, Paper } from '@mantine/core';
import { Patient } from '@medplum/fhirtypes';
import { PatientSummary, useResource } from '@medplum/react';
import { useParams } from 'react-router-dom';
import { PatientDetails } from '../components/PatientDetails';

export function PatientPage(): JSX.Element {
  const { id } = useParams();
  const patient = useResource<Patient>({ reference: `Patient/${id}` });
  if (!patient) {
    return <Loader />;
  }

  return (
    <Grid>
      <Grid.Col span={5}>
        <Paper>
          <PatientSummary patient={patient} />
        </Paper>
      </Grid.Col>
      <Grid.Col span={7}>
        <Paper>
          <PatientDetails patient={patient} />
        </Paper>
      </Grid.Col>
    </Grid>
  );
}
