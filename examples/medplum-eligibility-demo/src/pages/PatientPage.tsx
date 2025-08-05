// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Grid, Loader, Paper } from '@mantine/core';
import { Patient } from '@medplum/fhirtypes';
import { PatientSummary, useMedplum } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { PatientDetails } from '../components/PatientDetails';

export function PatientPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [patient, setPatient] = useState<Patient | undefined>();

  useEffect(() => {
    const fetchPatient = async (): Promise<void> => {
      if (!id) {
        return;
      }

      try {
        // Search for the patient.
        const patientData = await medplum.readResource('Patient', id);
        setPatient(patientData);
      } catch (error) {
        console.error(error);
      }
    };

    fetchPatient().catch((error) => console.error(error));
  });

  const onPatientChange = (updatedPatient: Patient): void => {
    // Re-render when the patient is updated
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
