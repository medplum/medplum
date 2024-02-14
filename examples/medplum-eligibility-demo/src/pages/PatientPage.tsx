import { Grid, Loader, Paper } from '@mantine/core';
import { Patient } from '@medplum/fhirtypes';
import { PatientSummary, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PatientDetails } from '../components/PatientDetails';

export function PatientPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [patient, setPatient] = useState<Patient | undefined>();
  // const patient = useResource<Patient>({ reference: `Patient/${id}` });

  useEffect(() => {
    const fetchPatient = async (): Promise<void> => {
      if (!id) {
        return;
      }

      try {
        const patientData = await medplum.readResource('Patient', id);
        setPatient(patientData);
      } catch (error) {
        console.error(error);
      }
    };

    fetchPatient();
  });

  const onPatientChange = (updatedPatient: Patient): void => {
    setPatient(updatedPatient);
  };

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
          <PatientDetails patient={patient} onChange={onPatientChange} />
        </Paper>
      </Grid.Col>
    </Grid>
  );
}
