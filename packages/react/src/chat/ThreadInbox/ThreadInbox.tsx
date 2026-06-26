// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ActionIcon, Box, Center, Flex, Skeleton, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import type { SearchRequest, WithId } from '@medplum/core';
import { normalizeErrorString, Operator, parseSearchRequest } from '@medplum/core';
import type { Communication, DocumentReference, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplumNavigate, useThreadInbox } from '@medplum/react-hooks';
import { IconMessageCircle, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import type { ListWithDetailPaneTab } from '../../ListWithDetailPane/ListWithDetailPane';
import { ListWithDetailPane } from '../../ListWithDetailPane/ListWithDetailPane';
import type { PatientSummarySectionConfig } from '../../PatientSummary/PatientSummary.types';
import { NewTopicDialog } from './NewTopicDialog';
import { ParticipantFilter } from './ParticipantFilter';
import { ThreadDetail } from './ThreadDetail';
import classes from './ThreadInbox.module.css';
import { ThreadListItem } from './ThreadListItem';

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

  // The list renders the parent thread (topic) of each tuple; the last message is
  // looked up by thread id when rendering each row.
  const items = useMemo(() => threadMessages.map(([topic]) => topic as WithId<Communication>), [threadMessages]);
  const lastMessageByThreadId = useMemo(() => {
    const map = new Map<string, Communication | undefined>();
    for (const [topic, last] of threadMessages) {
      if (topic.id) {
        map.set(topic.id, last);
      }
    }
    return map;
  }, [threadMessages]);

  const tabs = useMemo<ListWithDetailPaneTab[]>(
    () => [
      { value: 'in-progress', label: 'In Progress', uri: inProgressUri },
      { value: 'completed', label: 'Completed', uri: completedUri },
    ],
    [inProgressUri, completedUri]
  );

  const pageCount = total !== undefined ? Math.ceil(total / itemsPerPage) : 0;

  const headerActions = (
    <>
      <ParticipantFilter selectedParticipants={selectedParticipants} onFilterChange={handleParticipantsChange} />
      <Tooltip label="New Message" position="bottom" openDelay={500}>
        <ActionIcon radius="xl" variant="filled" color="blue" size={32} onClick={openModal}>
          <IconPlus size={16} />
        </ActionIcon>
      </Tooltip>
    </>
  );

  return (
    <>
      <div className={classes.container}>
        <ListWithDetailPane<WithId<Communication>>
          items={items}
          loading={loading}
          selectedKey={selectedThread?.id}
          selected={selectedThread as WithId<Communication> | undefined}
          listWidth={380}
          tabs={tabs}
          activeTab={status}
          onTabChange={(value) => navigate(value === 'in-progress' ? inProgressUri : completedUri)}
          headerActions={headerActions}
          skeleton={<ThreadListSkeleton />}
          emptyList={<EmptyMessagesState />}
          emptyDetail={<NoMessages />}
          refresh={refreshThreadMessages}
          page={currentPage}
          pageCount={pageCount}
          onPageChange={(page) => onChange({ ...currentSearch, offset: (page - 1) * itemsPerPage })}
          renderItem={(item) => (
            <ThreadListItem
              topic={item}
              lastCommunication={lastMessageByThreadId.get(item.id)}
              getThreadUri={getThreadUri}
            />
          )}
          renderDetail={(thread) => (
            <ThreadDetail
              thread={thread}
              showPatientSummary={showPatientSummary}
              sections={sections}
              uploadEnabled={uploadEnabled}
              onViewInDocuments={onViewInDocuments}
              onStatusChange={handleTopicStatusChangeWithErrorHandling}
            />
          )}
        />
      </div>
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

function ThreadListSkeleton(): JSX.Element {
  const titleWidths = [80, 72, 68, 64];
  const subtitleWidths = [85, 78, 70, 60];
  return (
    <Stack gap="md" p="md">
      {Array.from({ length: 10 }).map((_, index) => {
        const titleWidth = titleWidths[index % titleWidths.length];
        const subtitleWidth = subtitleWidths[index % subtitleWidths.length];
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
  );
}
