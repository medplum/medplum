// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Flex,
  Paper,
  ScrollArea,
  Stack,
  Text,
  ActionIcon,
  Divider,
  Button,
  Center,
  ThemeIcon,
  Menu,
  Skeleton,
  Box,
} from '@mantine/core';
import { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { PatientSummary, ThreadChat } from '@medplum/react';
import { JSX, useState, useEffect, useMemo } from 'react';
import { IconMessageCircle, IconChevronDown, IconPlus } from '@tabler/icons-react';
import { getReferenceString } from '@medplum/core';
import { ChatList } from './ChatList';
import { NewTopicDialog } from './NewTopicDialog';
import { useThreadInbox } from '../../hooks/useThreadInbox';
import classes from './ThreadInbox.module.css';
import { useDisclosure } from '@mantine/hooks';
import { showErrorNotification } from '../../utils/notifications';
import cx from 'clsx';

interface ThreadInboxProps {
  query: string;
  threadId: string | undefined;
  subject?: Reference<Patient> | Patient | undefined;
  showPatientSummary?: boolean | undefined;
  handleNewThread: (message: Communication) => void;
  onSelectedItem: (topic: Communication) => string;
}

export function ThreadInbox(props: ThreadInboxProps): JSX.Element {
  const { query, threadId, subject, showPatientSummary = false, handleNewThread, onSelectedItem } = props;

  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [status, setStatus] = useState<Communication['status']>('in-progress');

  const queryWithStatus = useMemo(() => `${query}&status=${status}`, [query, status]);

  const { loading, error, threadMessages, selectedThread, handleThreadtatusChange, addThreadMessage } = useThreadInbox({
    query: queryWithStatus,
    threadId,
  });

  useEffect(() => {
    if (error) {
      showErrorNotification(error);
    }
  }, [error]);

  const handleStatusChange = (newStatus: Communication['status']): void => {
    setStatus(newStatus);
  };

  const handleTopicStatusChangeWithErrorHandling = async (newStatus: Communication['status']): Promise<void> => {
    try {
      await handleThreadtatusChange(newStatus);
    } catch (error) {
      showErrorNotification(error);
    }
  };

  const handleNewTopicCompletion = (message: Communication): void => {
    addThreadMessage(message);
    handleNewThread(message);
  };

  return (
    <>
      <div className={classes.container}>
        <Flex h="100%" w="100%">
          {/* Left sidebar - Messages list */}
          <Flex direction="column" w="25%" h="100%" className={classes.rightBorder}>
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
                    className={cx(classes.button, { [classes.selected]: status === 'in-progress' })}
                    h={32}
                    radius="xl"
                    onClick={() => handleStatusChange('in-progress')}
                  >
                    In progress
                  </Button>

                  <Button
                    className={cx(classes.button, { [classes.selected]: status === 'completed' })}
                    h={32}
                    radius="xl"
                    onClick={() => handleStatusChange('completed')}
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
                      threads={threadMessages}
                      selectedCommunication={selectedThread}
                      onSelectedItem={onSelectedItem}
                    />
                  )
                )}
              </ScrollArea>
            </Paper>
          </Flex>

          {selectedThread ? (
            <>
              {/* Main chat area */}
              <Flex direction="column" w={showPatientSummary ? '50%' : '75%'} h="100%" className={classes.rightBorder}>
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
                              <Menu.Item onClick={() => handleTopicStatusChangeWithErrorHandling('completed')}>
                                Completed
                              </Menu.Item>
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
              </Flex>

              {/* Right sidebar - Patient summary */}
              {selectedThread && showPatientSummary && (
                <Flex direction="column" w="25%" h="100%">
                  <ScrollArea p={0} h="100%" scrollbarSize={10} type="hover" scrollHideDelay={250}>
                    <PatientSummary key={selectedThread.id} patient={selectedThread.subject as Reference<Patient>} />
                  </ScrollArea>
                </Flex>
              )}
            </>
          ) : (
            <Flex direction="column" w="75%" h="100%">
              <NoMessages />
            </Flex>
          )}
        </Flex>
      </div>
      <NewTopicDialog subject={subject} opened={modalOpened} onClose={closeModal} onSubmit={handleNewTopicCompletion} />
    </>
  );
}

function NoMessages(): JSX.Element {
  return (
    <Center h="100%" w="100%">
      <Stack align="center" gap="md">
        <ThemeIcon size={64} variant="light" color="gray">
          <IconMessageCircle size={32} />
        </ThemeIcon>
        <Stack align="center" gap="xs">
          <Text size="sm" c="dimmed" ta="center">
            Select a message from the list to view details
          </Text>
        </Stack>
      </Stack>
    </Center>
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
