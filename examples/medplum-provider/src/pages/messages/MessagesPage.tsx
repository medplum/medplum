import { ScrollArea, Text, Loader, Grid, Paper, Group, Flex, ActionIcon, Divider } from '@mantine/core';
import { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum, PatientSummary, ThreadChat } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
import { getReferenceString } from '@medplum/core';
import { ChatList } from '../../components/messages/ChatList';
import { NewTopicDialog } from '../../components/messages/NewTopicDialog';
import { showErrorNotification } from '../../utils/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';

/**
 * Messages page that matches the Home page layout but without the patient list.
 * @returns A React component that displays the messages page.
 */
export function MessagesPage(): JSX.Element {
  const medplum = useMedplum();
  const [loading, setLoading] = useState(false);
  const [selectedThread, setSelectedThread] = useState<Communication | undefined>(undefined);
  const [threadMessages, setThreadMessages] = useState<Communication[]>([]);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  useEffect(() => {
    async function fetchAllCommunications(): Promise<void> {
      const searchParams = new URLSearchParams();
      searchParams.append('_sort', '-sent');
      searchParams.append('part-of:missing', 'true');
      const searchResult = await medplum.searchResources('Communication', searchParams, { cache: 'no-cache' });
      setThreadMessages(searchResult);

      if (searchResult.length > 0) {
        setSelectedThread(searchResult[0]);
      }
    }
    setLoading(true);
    fetchAllCommunications()
      .catch(showErrorNotification)
      .finally(() => {
        setLoading(false);
      });
  }, [medplum]);

  return (
    <>
      <Grid style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
        {/* Left sidebar - Messages list */}
        <Grid.Col span={3} h="100%">
          <Paper h="100%">
            <ScrollArea h="100%" scrollbarSize={10} type="hover" scrollHideDelay={250}>
              <Flex p="md" justify="space-between">
                <Text fz="h4" fw={800} truncate>
                  Messages
                </Text>
                <ActionIcon radius="50%" variant="filled" color="blue" onClick={openModal}>
                  <IconPlus size={16} />
                </ActionIcon>
              </Flex>
              <Divider />
              {loading ? (
                <Group h="100%" align="center" justify="center">
                  <Loader />
                </Group>
              ) : (
                threadMessages.length > 0 && (
                  <ChatList
                    communications={threadMessages}
                    selectedCommunication={selectedThread}
                    onClick={(thread) => {
                      setSelectedThread(thread);
                    }}
                  />
                )
              )}
            </ScrollArea>
          </Paper>
        </Grid.Col>

        {/* Main chat area */}
        <Grid.Col span={6} h="100%">
          {selectedThread && (
            <ThreadChat key={`${getReferenceString(selectedThread)}`} title={'Messages'} thread={selectedThread} />
          )}
        </Grid.Col>

        {/* Right sidebar - Patient summary */}
        <Grid.Col span={3} h="100%">
          {selectedThread && (
            <ScrollArea p={0} h="100%" scrollbarSize={10} type="hover" scrollHideDelay={250}>
              <PatientSummary key={selectedThread.id} patient={selectedThread.subject as Reference<Patient>} />
            </ScrollArea>
          )}
        </Grid.Col>
      </Grid>

      <NewTopicDialog
        opened={modalOpened}
        onClose={closeModal}
        onSubmit={(communication) => {
          setThreadMessages([communication, ...threadMessages]);
          setSelectedThread(communication);
        }}
      />
    </>
  );
}
