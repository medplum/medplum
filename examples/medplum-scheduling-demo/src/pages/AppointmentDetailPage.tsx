import { Grid, Loader } from '@mantine/core';
import { Appointment, Patient, Reference } from '@medplum/fhirtypes';
import { Document, PatientSummary, useMedplum } from '@medplum/react';
import { useParams } from 'react-router-dom';
import { AppointmentDetails } from '../components/AppointmentDetails';
import { AppointmentActions } from '../components/AppointmentActions';
import { useEffect, useState } from 'react';

export function AppointmentDetailPage(): JSX.Element {
  const { id } = useParams();
  const medplum = useMedplum();
  const [appointment, setAppointment] = useState<Appointment | undefined>(undefined);
  const [patient, setPatient] = useState<Patient | undefined>(undefined);
  const [refreshSeed, setRefreshSeed] = useState(0); // Used to force a data reload after an encounter is created

  async function fetchData(): Promise<void> {
    // Here just to force a page reload after an encoutnter is created
    setAppointment(undefined);

    const foundAppointment: Appointment = await medplum.readResource('Appointment', id as string);
    setAppointment(foundAppointment);

    // Find a patient among the appointment participant
    const patientParticipant = foundAppointment?.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'));
    const foundPatient: Patient = await medplum.readReference(patientParticipant?.actor as Reference<Patient>);
    setPatient(foundPatient);
  }

  // Changes the seed value to force a data reload
  function refreshData(): void {
    setRefreshSeed(refreshSeed + 1);
  }

  useEffect(() => {
    fetchData().catch(console.error);
  }, [refreshSeed]);

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
        <Document p="xs">
          <AppointmentActions appointment={appointment} patient={patient} refreshData={refreshData} />
        </Document>
      </Grid.Col>
    </Grid>
  );
}
