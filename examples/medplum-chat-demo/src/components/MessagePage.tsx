import { Grid, GridCol, Paper, Tabs } from '@mantine/core';
import { parseReference, resolveId } from '@medplum/core';
import { Communication, Patient } from '@medplum/fhirtypes';
import { PatientSummary, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { CommunicationDetails } from './CommunicationDetails';

interface MessagePageProps {
  readonly message: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function MessagePage(props: MessagePageProps): JSX.Element {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient>();

  const patientReference = getPatientReference(props.message);

  useEffect(() => {
    const patientId = resolveId(patientReference);

    if (patientId) {
      medplum.readResource('Patient', patientId).then(setPatient).catch(console.error);
    }
  });

  return (
    <div>
      {patient ? (
        <Grid gutter="xs">
          <GridCol span={4}>
            <PatientSummary patient={patient} />
          </GridCol>
          <GridCol span={8}>
            <CommunicationDetails communication={props.message} isThread={false} />
          </GridCol>
        </Grid>
      ) : (
        <CommunicationDetails communication={props.message} isThread={false} />
      )}
    </div>
  );
}

function getPatientReference(message: Communication) {
  const sender = parseReference(message.sender);
  if (sender[0] === 'Patient') {
    return message.sender;
  }

  return undefined;
}
