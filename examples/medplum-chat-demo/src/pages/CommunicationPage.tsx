import { Grid, GridCol } from '@mantine/core';
import { resolveId } from '@medplum/core';
import { Communication, Patient } from '@medplum/fhirtypes';
import { Document, Loading, PatientSummary, ResourceTable, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CommunicationDetails } from '../components/CommunicationDetails';

export function CommunicationPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [communication, setCommunication] = useState<Communication>();
  const [patient, setPatient] = useState<Patient>();

  const patientReference = communication?.subject;

  useEffect(() => {
    if (id) {
      medplum.readResource('Communication', id).then(setCommunication).catch(console.error);
    }

    const patientId = resolveId(patientReference);
    if (patientId) {
      medplum.readResource('Patient', patientId).then(setPatient).catch(console.error);
    }
  });

  if (!communication) {
    return <Loading />;
  }

  return (
    <Grid>
      <GridCol span={4}>{patient ? <PatientSummary patient={patient} /> : null}</GridCol>
      <GridCol span={5}>
        <CommunicationDetails communication={communication} />
      </GridCol>
    </Grid>
  );
}
