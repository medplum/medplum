import { Anchor, Grid, GridCol, List, Paper, Stack, Title } from '@mantine/core';
import { resolveId } from '@medplum/core';
import { Communication, Patient } from '@medplum/fhirtypes';
import { PatientSummary, ThreadChat, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommunicationActions } from '../components/actions/CommunicationActions';

interface ThreadPageProps {
  readonly thread: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function ThreadPage(props: ThreadPageProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient>();

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
            <Paper m="md" h="600px">
              <ThreadChat thread={props.thread} inputDisabled={props.thread.status === 'completed'} />
            </Paper>
          </GridCol>
          <GridCol span={3}>
            <Paper>
              <CommunicationActions communication={props.thread} onChange={props.onChange} />
            </Paper>
            <Paper>
              <Stack m="md" p="md">
                <Title>Participants</Title>
                <List>
                  {props.thread.recipient?.map((participant, index) => (
                    <List.Item key={index}>
                      <Anchor onClick={() => navigate(`/${participant.reference}`)}>
                        {participant.display ?? participant.reference}
                      </Anchor>
                    </List.Item>
                  ))}
                </List>
              </Stack>
            </Paper>
          </GridCol>
        </Grid>
      ) : (
        <Grid gutter="xs">
          <GridCol span={6}>
            <Paper h="480px" m="md">
              <ThreadChat thread={props.thread} inputDisabled={props.thread.status === 'completed'} />
            </Paper>
          </GridCol>
          <GridCol span={6}>
            <Paper>
              <CommunicationActions communication={props.thread} onChange={props.onChange} />
            </Paper>
            <Paper>
              <Stack m="md" p="md">
                <Title>Participants</Title>
                <List>
                  {props.thread.recipient?.map((participant, index) => (
                    <List.Item key={index}>
                      <Anchor onClick={() => navigate(`/${participant.reference}`)}>
                        {participant.display ?? participant.reference}
                      </Anchor>
                    </List.Item>
                  ))}
                </List>
              </Stack>
            </Paper>
          </GridCol>
        </Grid>
      )}
    </div>
  );
}
