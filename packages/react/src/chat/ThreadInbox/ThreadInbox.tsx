// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ActionIcon,
  Button,
  Divider,
  Flex,
  Group,
  Menu,
  Paper,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import type { SearchRequest } from '@medplum/core';
import { getReferenceString, normalizeErrorString, Operator, parseSearchRequest } from '@medplum/core';
import type { Communication, DocumentReference, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplumNavigate, useThreadInbox } from '@medplum/react-hooks';
import { IconChevronDown, IconMessageCircle, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { listClasses } from '../../List/listClasses';
import { ListDetailLayout } from '../../List/ListDetailLayout';
import { ListEmptyState } from '../../List/ListEmptyState';
import { ListPagination } from '../../List/ListPagination';
import { ListScrollArea } from '../../List/ListScrollArea';
import { ListShell } from '../../List/ListShell';
import { ListSkeleton } from '../../List/ListSkeleton';
import { PatientSummary } from '../../PatientSummary/PatientSummary';
import type { PatientSummarySectionConfig } from '../../PatientSummary/PatientSummary.types';
import { ThreadChat } from '../ThreadChat/ThreadChat';
import { ChatList } from './ChatList';
import { NewTopicDialog } from './NewTopicDialog';
import { ParticipantFilter } from './ParticipantFilter';

/**
 * ThreadInbox is a component that displays a list of threads and allows the user to select a thread to view.
 * @param query - The query to fetch all communications.
 * @param threadId - The id of the thread to select.
 * @param subject - The default subject when creating a new thread.
 * @param showPatientSummary - Whether to show the patient summary.
 * @param sections - Optional sections configuration for the patient summary.
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
  readonly sections?: PatientSummarySectionConfig[];
  readonly onNew: (message: Communication) => void;
  readonly getThreadUri: (topic: Communication) => string;
  readonly onChange: (search: SearchRequest) => void;
  readonly inProgressUri: string;
  readonly completedUri: string;
  readonly uploadEnabled?: boolean;
  readonly onViewInDocuments?: (reference: Reference<DocumentReference>) => void;
  readonly allowPatientSelection?: boolean;
}

export function ThreadInbox(props: ThreadInboxProps): JSX.Element {
  const {
    query,
    threadId,
    subject,
    showPatientSummary = false,
    sections,
    onNew,
    getThreadUri,
    uploadEnabled,
    onViewInDocuments,
    onChange,
    inProgressUri,
    completedUri,
    allowPatientSelection = false,
  } = props;

  const navigate = useMedplumNavigate();
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  const currentSearch = useMemo(() => parseSearchRequest(`Communication?${query}`), [query]);

  const searchParams = useMemo(() => new URLSearchParams(query), [query]);
  const itemsPerPage = Number.parseInt(searchParams.get('_count') || '20', 10);
  const currentOffset = Number.parseInt(searchParams.get('_offset') || '0', 10);
  const status = (searchParams.get('status') as Communication['status']) || 'in-progress';

  const selectedParticipants = useMemo((): Reference<Patient | Practitioner>[] => {
    const recipientFilters = currentSearch.filters?.filter((f) => f.code === 'recipient') ?? [];
    return recipientFilters.flatMap((f) =>
      f.value
        .split(',')
        .filter(Boolean)
        .map((ref) => ({ reference: ref }))
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
      const otherFilters = currentSearch.filters?.filter((f) => f.code !== 'recipient') ?? [];

      const participantRefs = participants.map((p) => p.reference).filter(Boolean) as string[];
      const newFilters =
        participantRefs.length > 0
          ? [...otherFilters, { code: 'recipient', operator: Operator.EQUALS, value: participantRefs.join(',') }]
          : otherFilters;

      onChange({
        ...currentSearch,
        filters: newFilters,
        offset: 0,
      });
    },
    [currentSearch, onChange]
  );

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
      <ListDetailLayout>
        {/* Left sidebar - Messages list */}
        <ListShell
          header={
            <>
              <Tabs
                value={status}
                onChange={(value) => {
                  navigate(value === 'in-progress' ? inProgressUri : completedUri);
                }}
                variant="unstyled"
                className={listClasses.pillTabs}
              >
                <Tabs.List>
                  <Tabs.Tab value="in-progress">In Progress</Tabs.Tab>
                  <Tabs.Tab value="completed">Completed</Tabs.Tab>
                </Tabs.List>
              </Tabs>
              <Group gap="xs">
                <ParticipantFilter
                  selectedParticipants={selectedParticipants}
                  onFilterChange={handleParticipantsChange}
                />
                <Tooltip label="New Message" position="bottom" openDelay={500}>
                  <ActionIcon radius="xl" variant="filled" color="blue" size={32} onClick={openModal}>
                    <IconPlus size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </>
          }
          footer={
            loading ? null : (
              <ListPagination
                total={total}
                offset={currentOffset}
                pageSize={itemsPerPage}
                onOffsetChange={(offset) => onChange({ ...currentSearch, offset })}
              />
            )
          }
        >
          <ListScrollArea>
            {loading ? (
              <ListSkeleton rows={10} linesPerRow={2} withAvatar />
            ) : (
              threadMessages.length > 0 && (
                <ChatList threads={threadMessages} selectedCommunication={selectedThread} getThreadUri={getThreadUri} />
              )
            )}
            {threadMessages.length === 0 && !loading && <ListEmptyState message="No messages found" />}
          </ListScrollArea>
        </ListShell>

        {selectedThread ? (
          <>
            {/* Main chat area */}
            <ListDetailLayout.Column bordered>
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
                      uploadEnabled={uploadEnabled}
                      onViewInDocuments={onViewInDocuments}
                    />
                  </Flex>
                </Stack>
              </Paper>
            </ListDetailLayout.Column>

            {/* Right sidebar - Patient summary */}
            {selectedThread.subject && showPatientSummary && (
              <Flex direction="column" w={300} h="100%">
                <ScrollArea p={0} h="100%" scrollbarSize={10} type="hover" scrollHideDelay={250}>
                  <PatientSummary
                    key={selectedThread.id}
                    patient={selectedThread.subject as Reference<Patient>}
                    sections={sections}
                  />
                </ScrollArea>
              </Flex>
            )}
          </>
        ) : (
          <ListDetailLayout.Column>
            <ListEmptyState
              icon={<IconMessageCircle size={32} />}
              message="No message selected"
              description="Select a message from the list to view details"
            />
          </ListDetailLayout.Column>
        )}
      </ListDetailLayout>
      <NewTopicDialog
        subject={subject}
        opened={modalOpened}
        onClose={closeModal}
        onSubmit={handleNewTopicCompletion}
        allowPatientSelection={allowPatientSelection}
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
