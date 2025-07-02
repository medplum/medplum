import { ScrollArea, Text, Loader, Paper, Group, Stack, Divider, Flex, Button, ActionIcon } from '@mantine/core';
import { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum, PatientSummary, ThreadChat } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
import { getReferenceString } from '@medplum/core';
import { ChatList } from '../../components/messages/ChatList';
import { NewTopicDialog } from '../../components/messages/NewTopicDialog';
import { showErrorNotification } from '../../utils/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import classes from './MessagesPage.module.css';
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
    <div className={classes.container}>
      <Flex h="100%" w="100%">
        {/* Left sidebar - Messages list */}
        <Flex direction="column" w="25%" h="100%" style={{ borderRight: '1px solid var(--mantine-color-gray-3)' }}>
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
        </Flex>

        {/* Main chat area */}
        <Flex direction="column" w="50%" h="100%">
          {selectedThread && (
            <Paper h="100%">
              <Stack h="100%" gap={0}>
                <Flex h={64} align="center" justify="space-between" p="md">
                  <Text fw={800} truncate fz="lg">
                    {selectedThread.topic?.text ?? 'Messages'}
                  </Text>
                  <Button variant="outline" size="xs" leftSection={<IconTrash />}>
                    Delete
                  </Button>
                </Flex>
                <Divider />
                <Flex direction="column" h="100%">
                  <ThreadChat
                    key={`${getReferenceString(selectedThread)}`}
                    title={'Messages'}
                    thread={selectedThread}
                  />
                </Flex>
              </Stack>
            </Paper>
          )}
        </Flex>

        {/* Right sidebar - Patient summary */}
        <Flex direction="column" w="25%" h="100%">
          {selectedThread && (
            <ScrollArea p={0} h="100%" scrollbarSize={10} type="hover" scrollHideDelay={250}>
              <PatientSummary key={selectedThread.id} patient={selectedThread.subject as Reference<Patient>} />
            </ScrollArea>
            )}
          </Flex>
        </Flex>
      </div>
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
