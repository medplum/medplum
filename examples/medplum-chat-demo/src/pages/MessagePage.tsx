import { Grid, GridCol } from '@mantine/core';
import { parseReference, resolveId } from '@medplum/core';
import { Communication, Patient } from '@medplum/fhirtypes';
import { PatientSummary, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { CommunicationDetails } from '../components/CommunicationDetails';

interface MessagePageProps {
  readonly message: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function MessagePage(props: MessagePageProps): JSX.Element {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient>();

  // Get a reference to the patient if the sender of the message is a patient
  const patientReference = getPatientReference(props.message);

  useEffect(() => {
    const patientId = resolveId(patientReference);

    if (patientId) {
      // Get the patient resource to display their summary
      medplum.readResource('Patient', patientId).then(setPatient).catch(console.error);
    }
  }, [patientReference, medplum]);

  return (
    <div>
      {patient ? (
        <Grid gutter="xs">
          <GridCol span={4}>
            <PatientSummary patient={patient} />
          </GridCol>
          <GridCol span={8}>
            <CommunicationDetails communication={props.message} />
          </GridCol>
        </Grid>
      ) : (
        <CommunicationDetails communication={props.message} />
      )}
    </div>
  );
}

// If the sender of the message is a patient, return a reference to that patient
function getPatientReference(message: Communication): Communication['sender'] | undefined {
  const sender = parseReference(message.sender);
  if (sender[0] === 'Patient') {
    return message.sender;
  }

  return undefined;
}
