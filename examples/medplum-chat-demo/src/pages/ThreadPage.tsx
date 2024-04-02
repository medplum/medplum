import { Grid, GridCol, Paper } from '@mantine/core';
import { resolveId } from '@medplum/core';
import { Communication, Patient } from '@medplum/fhirtypes';
import { PatientSummary, useMedplum, ThreadChat } from '@medplum/react';
import { useEffect, useState } from 'react';
import { CommunicationActions } from '../components/actions/CommunicationActions';
import { CommunicationDetails } from '../components/CommunicationDetails';

interface ThreadPageProps {
  readonly thread: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function ThreadPage(props: ThreadPageProps): JSX.Element {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient>();

  // Get the topic to display on the chat
  const topic = props.thread.topic?.coding?.[0].display ?? 'Thread';

  const patientReference = props.thread.subject;

  useEffect(() => {
    const patientId = resolveId(patientReference);

    // Get the patient linked to this thread to display their information.
    if (patientId) {
      medplum.readResource('Patient', patientId).then(setPatient).catch(console.error);
    }
  }, [patientReference, medplum]);

  return (
    <div>
      {patient ? (
        <Grid gutter="xs">
          <GridCol span={4}>
            <PatientSummary patient={patient} m="md" />
          </GridCol>
          <GridCol span={5}>
            <CommunicationDetails communication={props.thread} />
          </GridCol>
          <GridCol span={3}>
            <Paper>
              <CommunicationActions communication={props.thread} onChange={props.onChange} />
            </Paper>
          </GridCol>
        </Grid>
      ) : (
        <Grid gutter="xs">
          <GridCol span={8}>
            <CommunicationDetails communication={props.thread} />
          </GridCol>
          <GridCol span={4}>
            <Paper m="md">
              <CommunicationActions communication={props.thread} onChange={props.onChange} />
            </Paper>
          </GridCol>
        </Grid>
      )}
      <ThreadChat thread={props.thread} title={topic} />
    </div>
  );
}
