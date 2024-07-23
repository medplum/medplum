import { Grid, Loader } from '@mantine/core';
import { Appointment, Patient } from '@medplum/fhirtypes';
import { Document, PatientSummary, useResource } from '@medplum/react';
import { useParams } from 'react-router-dom';
import { AppointmentDetails } from '../components/AppointmentDetails';

export function AppointmentDetailPage(): JSX.Element {
  const { id } = useParams();
  const appointment = useResource<Appointment>({ reference: `Appointment/${id}` });

  // Find a patient among the appointment participant
  const patientParticipant = appointment?.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'));

  const patient = useResource<Patient>({ reference: patientParticipant?.actor?.reference });

  if (!appointment || !patient) {
    return <Loader />;
  }

  return (
    <Grid>
      <Grid.Col span={4}>
        <PatientSummary patient={patient} />
      </Grid.Col>
      <Grid.Col span={5}>
        <AppointmentDetails appointment={appointment} patient={patient} />
      </Grid.Col>
      <Grid.Col span={3}>
        <Document p="xs"></Document>
      </Grid.Col>
    </Grid>
  );
}
