import { ScrollArea, Text, Paper, Stack, Divider, Flex, Button, ActionIcon, Menu, Skeleton, Box } from '@mantine/core';
import { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum, PatientSummary, ThreadChat } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
import { getReferenceString } from '@medplum/core';
import { ChatList } from '../../components/messages/ChatList';
import { NewTopicDialog } from '../../components/messages/NewTopicDialog';
import { showErrorNotification } from '../../utils/notifications';
import { IconChevronDown, IconPlus } from '@tabler/icons-react';
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
  const [status, setStatus] = useState<Communication['status']>('in-progress');

  useEffect(() => {
    async function fetchAllCommunications(): Promise<void> {
      const searchParams = new URLSearchParams();
      searchParams.append('_sort', '-sent');
      searchParams.append('part-of:missing', 'true');
      searchParams.append('status', status);
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
  }, [medplum, status]);

  const handleStatusChange = async (status: Communication['status']): Promise<void> => {
    if (!selectedThread) {
      return;
    }
    try {
      const updatedThread = await medplum.updateResource({
        ...selectedThread,
        status: status,
      });
      setSelectedThread(updatedThread);
    } catch (error) {
      showErrorNotification(error);
    }
  };

  return (
    <>
      <div className={classes.container}>
        <Flex h="100%" w="100%">
          {/* Left sidebar - Messages list */}
          <Flex direction="column" w="25%" h="100%" style={{ borderRight: '1px solid var(--mantine-color-gray-3)' }}>
            <Paper h="100%">
              <ScrollArea h="100%" scrollbarSize={10} type="hover" scrollHideDelay={250}>
                <Flex h={64} align="center" justify="space-between" p="md">
                  <Text fz="h4" fw={800} truncate>
                    Messages
                  </Text>
                  <ActionIcon radius="50%" variant="filled" color="blue" onClick={openModal}>
                    <IconPlus size={16} />
                  </ActionIcon>
                </Flex>
                <Divider />
                <Flex p="md" gap="xs">
                  <Button
                    variant={status === 'in-progress' ? 'filled' : 'outline'}
                    color="black"
                    h={24}
                    radius="xl"
                    onClick={() => setStatus('in-progress')}
                  >
                    In progress
                  </Button>

                  <Button
                    variant={status === 'completed' ? 'filled' : 'outline'}
                    color="black"
                    h={24}
                    radius="xl"
                    onClick={() => setStatus('completed')}
                  >
                    Completed
                  </Button>
                </Flex>
                <Divider />
                {loading ? (
                  <Stack gap="md" p="md">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <Flex key={index} gap="sm" align="flex-start">
                        <Skeleton height={40} width={40} radius="50%" />
                        <Box style={{ flex: 1 }}>
                          <Flex direction="column" gap="xs">
                            <Skeleton height={16} width={`${Math.random() * 40 + 60}%`} />
                            <Skeleton height={14} width={`${Math.random() * 50 + 40}%`} />
                          </Flex>
                        </Box>
                      </Flex>
                    ))}
                  </Stack>
                ) : (
                  threadMessages.length > 0 && (
                    <ChatList
                      communications={threadMessages}
                      selectedCommunication={selectedThread}
                      onClick={setSelectedThread}
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

                    <Menu position="bottom-end" shadow="md">
                      <Menu.Target>
                        <Button
                          variant="light"
                          color={getStatusColor(selectedThread.status)}
                          rightSection={
                            selectedThread.status === 'completed' ? undefined : <IconChevronDown size={16} />
                          }
                          radius="xl"
                          size="sm"
                        >
                          {selectedThread.status
                            .split('-')
                            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(' ')}
                        </Button>
                      </Menu.Target>

                      {selectedThread.status !== 'completed' && (
                        <>
                          <Menu.Dropdown>
                            <Menu.Item onClick={() => handleStatusChange('completed')}>Completed</Menu.Item>
                            <Menu.Item onClick={() => handleStatusChange('stopped')}>Stopped</Menu.Item>
                          </Menu.Dropdown>
                        </>
                      )}
                    </Menu>
                  </Flex>
                  <Divider />
                  <Flex direction="column" h="100%">
                    <ThreadChat
                      key={`${getReferenceString(selectedThread)}`}
                      title={'Messages'}
                      thread={selectedThread}
                      excludeHeader={true}
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

function getStatusColor(status: Communication['status']): string {
  if (status === 'completed') {
    return 'green';
  }
  if (status === 'stopped') {
    return 'red';
  }
  return 'blue';
}
