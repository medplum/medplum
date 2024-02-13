import { Grid, Loader, Paper, Title } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { Document, PatientSummary, useResource } from '@medplum/react';
import { useParams } from 'react-router-dom';
import { PatientDetails } from '../components/PatientDetails';
import { PatientHeader } from './PatientHeader';

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
