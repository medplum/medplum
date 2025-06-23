import { ScrollArea, Text, Loader, Grid, Flex, Paper, Group } from '@mantine/core';
import { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum, BaseChat, PatientSummary, useMedplumProfile } from '@medplum/react';
import { JSX, useEffect, useState, useMemo, useCallback } from 'react';
import { createReference, getReferenceString } from '@medplum/core';
import { ChatList } from '../../components/messages/ChatList';
import { showNotification } from '@mantine/notifications';
import { showErrorNotification } from '../../utils/notifications';

/**
 * Messages page that matches the Home page layout but without the patient list.
 * @returns A React component that displays the messages page.
 */
export function MessagesPage(): JSX.Element {
  const medplum = useMedplum();
  const [loading, setLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Reference<Patient> | undefined>(undefined);
  const [inProgressCommunications, setInProgressCommunications] = useState<Communication[]>([]);
  const [threadMessages, setThreadMessages] = useState<Communication[]>([]);
  const profile = useMedplumProfile();
  const profileRef = useMemo(() => (profile ? createReference(profile) : undefined), [profile]);

  useEffect(() => {
    async function fetchAllCommunications(): Promise<void> {
      if (selectedPatient) {
        return;
      }

      const searchParams = new URLSearchParams();
      searchParams.append('_sort', '-sent');
      searchParams.append('received:missing', 'true');
      const searchResult = await medplum.searchResources('Communication', searchParams, { cache: 'no-cache' });

      const threads: Communication[] = [];
      const threadMap: Set<string> = new Set<string>();
      searchResult.forEach((c) => {
        if (c.subject?.reference && !threadMap.has(c.subject.reference)) {
          threadMap.add(c.subject.reference);
          threads.push(c);
        }
      });

      setInProgressCommunications(threads);

      if (threads.length > 0) {
        setSelectedPatient(threads[0].subject as Reference<Patient>);
      }
    }
    fetchAllCommunications().catch(() => setLoading(false));
  }, [medplum, selectedPatient]);

  const sendMessage = useCallback(
    (message: string) => {
      if (!selectedPatient) {
        showNotification({
          title: 'No patient selected',
          message: 'Please select a patient to send a message',
          color: 'red',
        });
        return;
      }

      if (!profileRef) {
        return;
      }

      medplum
        .createResource<Communication>({
          resourceType: 'Communication',
          status: 'in-progress',
          sender: profileRef,
          subject: selectedPatient,
          recipient: [selectedPatient],
          sent: new Date().toISOString(),
          payload: [{ contentString: message }],
        })
        .catch(showErrorNotification);
    },
    [medplum, selectedPatient, profileRef]
  );

  return (
    <Grid style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
      {/* Left sidebar - Messages list */}
      <Grid.Col span={3} h="100%">
        <Paper h="100%">
          <ScrollArea h="100%" scrollbarSize={10} type="hover" scrollHideDelay={250}>
            <Group p="md">
              <Text fz="h4" fw={800} truncate>
                Messages
              </Text>
            </Group>
            {loading ? (
              <Flex h="100%" align="center" justify="center">
                <Loader />
              </Flex>
            ) : (
              selectedPatient && (
                <ChatList
                  communications={inProgressCommunications}
                  selectedPatient={selectedPatient}
                  onClick={(patient) => {
                    setThreadMessages([]);
                    setSelectedPatient(patient);
                  }}
                />
              )
            )}
          </ScrollArea>
        </Paper>
      </Grid.Col>

      {/* Main chat area */}
      <Grid.Col span={6} h="100%">
        {selectedPatient ? (
          <BaseChat
            key={`${getReferenceString(selectedPatient)}`}
            title={'Messages'}
            communications={threadMessages}
            setCommunications={setThreadMessages}
            query={`subject=${getReferenceString(selectedPatient)}`}
            sendMessage={sendMessage}
          />
        ) : (
          <div style={{ background: 'white', height: '100%' }}>
            <Text>Select a patient to start a conversation</Text>
          </div>
        )}
      </Grid.Col>

      {/* Right sidebar - Patient summary */}
      <Grid.Col span={3} h="100%">
        {selectedPatient && (
          <ScrollArea h="100%" scrollbarSize={10} type="hover" scrollHideDelay={250}>
            <PatientSummary key={selectedPatient.id} patient={selectedPatient} />
          </ScrollArea>
        )}
      </Grid.Col>
    </Grid>
  );
}
