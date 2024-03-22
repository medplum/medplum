import { Grid, GridCol, Loader } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { PatientSummary, useMedplum } from '@medplum/react';
import { IconCircleOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PatientDetails } from '../components/PatientDetails';

export function PatientPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const [patient, setPatient] = useState<Patient | undefined>();

  useEffect(() => {
    medplum
      .readResource('Patient', id)
      .then(setPatient)
      .catch((err) => {
        showNotification({
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      });
  }, [id, medplum]);

  if (!patient) {
    return <Loader />;
  }

  return (
    <Grid>
      <GridCol span={4}>
        <PatientSummary patient={patient} />
      </GridCol>
      <GridCol span={8}>
        <PatientDetails onChange={setPatient} />
      </GridCol>
    </Grid>
  );
}
