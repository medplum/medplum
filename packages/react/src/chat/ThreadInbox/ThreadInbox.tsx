// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ActionIcon,
  Box,
  Button,
  Center,
  Divider,
  Flex,
  Group,
  Menu,
  Pagination,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import type { SearchRequest } from '@medplum/core';
import { getReferenceString, normalizeErrorString, Operator, parseSearchRequest } from '@medplum/core';
import type { Communication, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplumNavigate, useThreadInbox } from '@medplum/react-hooks';
import { IconChevronDown, IconMessageCircle, IconPlus } from '@tabler/icons-react';
import cx from 'clsx';
import type { ComponentType, JSX } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { PatientSummary } from '../../PatientSummary/PatientSummary';
import type { PharmacyDialogBaseProps } from '../../PatientSummary/Pharmacies';
import { ThreadChat } from '../ThreadChat/ThreadChat';
import { ChatList } from './ChatList';
import { NewTopicDialog } from './NewTopicDialog';
import { ParticipantFilter } from './ParticipantFilter';
import classes from './ThreadInbox.module.css';

/**
 * ThreadInbox is a component that displays a list of threads and allows the user to select a thread to view.
 * @param query - The query to fetch all communications.
 * @param threadId - The id of the thread to select.
 * @param subject - The default subject when creating a new thread.
 * @param showPatientSummary - Whether to show the patient summary.
 * @param pharmacyDialogComponent - Optional component to render as the pharmacy dialog in the patient summary.
 * @param onNew - A function to handle a new thread.
 * @param getThreadUri - A function to build thread URIs.
 * @param onChange - A function to handle search changes.
 * @param inProgressUri - The URI for in-progress threads.
 * @param completedUri - The URI for completed threads.
 */

export interface ThreadInboxProps {
  readonly query: string;
  readonly threadId: string | undefined;
  readonly subject?: Reference<Patient> | Patient;
  readonly showPatientSummary?: boolean;
  readonly pharmacyDialogComponent?: ComponentType<PharmacyDialogBaseProps>;
  readonly onNew: (message: Communication) => void;
  readonly getThreadUri: (topic: Communication) => string;
  readonly onChange: (search: SearchRequest) => void;
  readonly inProgressUri: string;
  readonly completedUri: string;
}

export function ThreadInbox(props: ThreadInboxProps): JSX.Element {
  const {
    query,
    threadId,
    subject,
    showPatientSummary = false,
    pharmacyDialogComponent,
    onNew,
    getThreadUri,
    onChange,
    inProgressUri,
    completedUri,
  } = props;

  const navigate = useMedplumNavigate();
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  const currentSearch = useMemo(() => parseSearchRequest(`Communication?${query}`), [query]);

  const searchParams = useMemo(() => new URLSearchParams(query), [query]);
  const itemsPerPage = Number.parseInt(searchParams.get('_count') || '20', 10);
  const currentOffset = Number.parseInt(searchParams.get('_offset') || '0', 10);
  const currentPage = Math.floor(currentOffset / itemsPerPage) + 1;
  const status = (searchParams.get('status') as Communication['status']) || 'in-progress';

  // Extract participants from parsed search request filters (comma-separated)
  const selectedParticipants = useMemo((): Reference<Patient | Practitioner>[] => {
    const recipientFilters = currentSearch.filters?.filter((f) => f.code === 'recipient') ?? [];
    // Split comma-separated values and flatten
    return recipientFilters.flatMap((f) =>
      f.value
        .split(',')
        .filter(Boolean)
        .map((ref) => ({ reference: ref }) as Reference<Patient | Practitioner>)
    );
  }, [currentSearch]);

  const {
    loading,
    error,
    threadMessages,
    selectedThread,
    total,
    handleThreadStatusChange,
    addThreadMessage,
    refreshThreadMessages,
  } = useThreadInbox({
    query,
    threadId,
  });

  const handleParticipantsChange = useCallback(
    (participants: Reference<Patient | Practitioner>[]) => {
      // Remove existing recipient filters
      const otherFilters = currentSearch.filters?.filter((f) => f.code !== 'recipient') ?? [];

      // Add recipient filter with comma-separated values (OR logic in FHIR)
      const participantRefs = participants.map((p) => p.reference).filter(Boolean) as string[];
      const newFilters =
        participantRefs.length > 0
          ? [...otherFilters, { code: 'recipient', operator: Operator.EQUALS, value: participantRefs.join(',') }]
          : otherFilters;

      onChange({
        ...currentSearch,
        filters: newFilters,
        offset: 0, // Reset to first page when filter changes
      });
    },
    [currentSearch, onChange]
  );

  const skeletonTitleWidths = [80, 72, 68, 64];
  const skeletonSubtitleWidths = [85, 78, 70, 60];

  useEffect(() => {
    if (error) {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    }
  }, [error]);

  const handleTopicStatusChangeWithErrorHandling = async (newStatus: Communication['status']): Promise<void> => {
    handleThreadStatusChange(newStatus);
    try {
      await refreshThreadMessages();
    } catch (error) {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    }
  };

  const handleNewTopicCompletion = (message: Communication): void => {
    addThreadMessage(message);
    onNew(message);
  };

  return (
    <>
      <div className={classes.container}>
        <Flex direction="row" h="100%" w="100%">
          {/* Left sidebar - Messages list */}
          <Flex direction="column" w={380} h="100%" className={classes.rightBorder}>
            <Paper h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
              <ScrollArea style={{ flex: 1 }} scrollbarSize={10} type="hover" scrollHideDelay={250}>
                <Flex h={64} align="center" justify="space-between" p="md">
                  <Group gap="xs">
                    <Button
                      onClick={() => navigate(inProgressUri)}
                      className={cx(classes.button, { [classes.selected]: status === 'in-progress' })}
                      h={32}
                      radius="xl"
                    >
                      In progress
                    </Button>
                    <Button
                      onClick={() => navigate(completedUri)}
                      className={cx(classes.button, { [classes.selected]: status === 'completed' })}
                      h={32}
                      radius="xl"
                    >
                      Completed
                    </Button>
                    <ParticipantFilter
                      selectedParticipants={selectedParticipants}
                      onFilterChange={handleParticipantsChange}
                    />
                  </Group>
                  <ActionIcon radius="50%" variant="filled" color="blue" onClick={openModal}>
                    <IconPlus size={16} />
                  </ActionIcon>
                </Flex>
                <Divider />
                {loading ? (
                  <Stack gap="md" p="md">
                    {Array.from({ length: 10 }).map((_, index) => {
                      const titleWidth = skeletonTitleWidths[index % skeletonTitleWidths.length];
                      const subtitleWidth = skeletonSubtitleWidths[index % skeletonSubtitleWidths.length];
                      return (
                        <Flex key={index} gap="sm" align="flex-start">
                          <Skeleton height={40} width={40} radius="50%" />
                          <Box style={{ flex: 1 }}>
                            <Flex direction="column" gap="xs">
                              <Skeleton height={16} width={`${titleWidth}%`} />
                              <Skeleton height={14} width={`${subtitleWidth}%`} />
                            </Flex>
                          </Box>
                        </Flex>
                      );
                    })}
                  </Stack>
                ) : (
                  threadMessages.length > 0 && (
                    <ChatList
                      threads={threadMessages}
                      selectedCommunication={selectedThread}
                      getThreadUri={getThreadUri}
                    />
                  )
                )}
                {threadMessages.length === 0 && !loading && <EmptyMessagesState />}
              </ScrollArea>
              {!loading && total !== undefined && total > itemsPerPage && (
                <Box p="md">
                  <Center>
                    <Pagination
                      value={currentPage}
                      total={Math.ceil(total / itemsPerPage)}
                      onChange={(page) => {
                        const offset = (page - 1) * itemsPerPage;
                        onChange({
                          ...currentSearch,
                          offset,
                        });
                      }}
                      size="sm"
                      siblings={1}
                      boundaries={1}
                    />
                  </Center>
                </Box>
              )}
            </Paper>
          </Flex>

          {selectedThread ? (
            <>
              {/* Main chat area */}
              <Flex direction="column" style={{ flex: 1 }} h="100%" className={classes.rightBorder}>
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
                          <Menu.Dropdown>
                            <Menu.Item onClick={() => handleTopicStatusChangeWithErrorHandling('completed')}>
                              Completed
                            </Menu.Item>
                          </Menu.Dropdown>
                        )}
                      </Menu>
                    </Flex>
                    <Divider />
                    <Flex direction="column" style={{ flex: 1 }} h="100%">
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
              {selectedThread.subject && showPatientSummary && (
                <Flex direction="column" w={300} h="100%">
                  <ScrollArea p={0} h="100%" scrollbarSize={10} type="hover" scrollHideDelay={250}>
                    <PatientSummary
                      key={selectedThread.id}
                      patient={selectedThread.subject as Reference<Patient>}
                      pharmacyDialogComponent={pharmacyDialogComponent}
                    />
                  </ScrollArea>
                </Flex>
              )}
            </>
          ) : (
            <Flex direction="column" style={{ flex: 1 }} h="100%">
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

function EmptyMessagesState(): JSX.Element {
  return (
    <Flex direction="column" h="100%" justify="center" align="center">
      <Stack align="center" gap="md" pt="xl">
        <IconMessageCircle size={64} color="var(--mantine-color-gray-4)" />
        <Text size="lg" c="dimmed" fw={500}>
          No messages found
        </Text>
      </Stack>
    </Flex>
  );
}
