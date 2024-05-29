import { Grid, Loader } from '@mantine/core';
import { Patient } from '@medplum/fhirtypes';
import { PatientSummary, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PatientDetails } from '../components/PatientDetails';

export function PatientPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [patient, setPatient] = useState<Patient>();

  useEffect(() => {
    if (id) {
      medplum.readResource('Patient', id).then(setPatient).catch(console.error);
    }
  }, [medplum, id]);

  function onPatientChange(patient: Patient): void {
    setPatient(patient);
  }

  if (!patient) {
    return <Loader />;
  }

  return (
    <Grid>
      <Grid.Col span={4}>
        <PatientSummary patient={patient} />
      </Grid.Col>
      <Grid.Col span={8}>
        <PatientDetails patient={patient} onChange={onPatientChange} />
      </Grid.Col>
    </Grid>
  );
}
