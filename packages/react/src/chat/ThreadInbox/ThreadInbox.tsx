// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ActionIcon,
  Box,
  Button,
  Center,
  Divider,
  Flex,
  Menu,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import type { MedplumClient, SearchRequest } from '@medplum/core';
import {
  formatSearchQuery,
  getReferenceString,
  normalizeErrorString,
  Operator,
  parseSearchRequest,
} from '@medplum/core';
import type { Communication, DocumentReference, Patient, Practitioner, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconChevronDown, IconMessageCircle, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { PatientSummary } from '../../PatientSummary/PatientSummary';
import type { PatientSummarySectionConfig } from '../../PatientSummary/PatientSummary.types';
import type {
  ResourceBoardDetailContext,
  ResourceBoardLoadResult,
  ResourceBoardTab,
} from '../../ResourceBoard/ResourceBoard';
import { ResourceBoard } from '../../ResourceBoard/ResourceBoard';
import { ThreadChat } from '../ThreadChat/ThreadChat';
import { NewTopicDialog } from './NewTopicDialog';
import { ParticipantFilter } from './ParticipantFilter';
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

  const medplum = useMedplum();
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  const currentSearch = useMemo(() => parseSearchRequest(`Communication?${query}`), [query]);
  const status = useMemo(() => new URLSearchParams(query).get('status') ?? 'in-progress', [query]);

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

  // Last message per thread id, rebuilt by every load and read by renderItem.
  const lastMessagesRef = useRef<Map<string, Communication>>(new Map());
  // Topics created via NewTopicDialog have no messages yet, so the thread search
  // misses them; they are prepended to the next load only.
  const pendingTopicsRef = useRef<Communication[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // ThreadInbox owns this fetch because it is two coupled steps: the FHIR search for
  // top-level threads (built from the board-provided SearchRequest plus thread-list
  // prerequisites) and a GraphQL batch for each thread's last message. The result
  // populates lastMessagesRef for renderItem and prepends any topics created since the
  // last load (which have no messages yet, so the search misses them).
  const loadItems = useCallback(
    async (search: SearchRequest, client: MedplumClient): Promise<ResourceBoardLoadResult> => {
      const searchParams = new URLSearchParams(
        formatSearchQuery({ ...search, total: search.total ?? 'accurate', fields: undefined })
      );
      searchParams.append('identifier:not', 'http://medplum.com/ai-message|');
      searchParams.append('part-of:missing', 'true');
      searchParams.append('_has:Communication:part-of:_id:not', 'null');

      const bundle = await client.search('Communication', searchParams.toString(), { cache: 'no-cache' });
      const parents =
        bundle.entry
          ?.map((entry) => entry.resource as Communication)
          .filter((r): r is Communication => r !== undefined) || [];

      const pending = pendingTopicsRef.current;
      pendingTopicsRef.current = [];

      if (parents.length === 0) {
        lastMessagesRef.current = new Map();
        return { items: pending, total: bundle.total };
      }

      const queryParts = parents.map((parent) => {
        const safeId = parent.id?.replaceAll('-', '') || '';
        const alias = `thread_${safeId}`;
        const ref = getReferenceString(parent);

        return `
          ${alias}: CommunicationList(
            part_of: "${ref}"
            _sort: "-sent"
            _count: 1
          ) {
            id
            meta {
              lastUpdated
            }
            partOf {
              reference
            }
            sender {
              display
              reference
            }
            payload {
              contentString
            }
            sent
            status
          }
        `;
      });

      const fullQuery = `
        query {
          ${queryParts.join('\n')}
        }
      `;

      const response = await client.graphql(fullQuery);

      const lastMessages = new Map<string, Communication>();
      const threads: Communication[] = [];
      for (const parent of parents) {
        const safeId = parent.id?.replaceAll('-', '') || '';
        const childList = response.data[`thread_${safeId}`] as Communication[] | undefined;
        const lastMessage = childList && childList.length > 0 ? childList[0] : undefined;
        if (lastMessage !== undefined && parent.id) {
          lastMessages.set(parent.id, lastMessage);
          threads.push(parent);
        }
      }
      lastMessagesRef.current = lastMessages;

      const items = [...pending.filter((p) => !threads.some((t) => t.id === p.id)), ...threads];
      return { items, total: bundle.total };
    },
    // refreshKey retriggers the load after a new topic is created (see handleNewTopicCompletion).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshKey]
  );

  const resolveSelected = useCallback(
    async (id: string, items: Resource[], client: MedplumClient): Promise<Resource | undefined> => {
      const found = items.find((item) => item.id === id);
      if (found) {
        return found;
      }
      // The id may belong to a child message: resolve to its parent thread.
      const communication: Communication = await client.readResource('Communication', id);
      if (communication.partOf === undefined) {
        return communication;
      }
      const parentRef = communication.partOf[0].reference;
      if (parentRef) {
        return client.readReference({ reference: parentRef });
      }
      return undefined;
    },
    []
  );

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

  const handleStatusChange = async (
    thread: Communication,
    refresh: () => Promise<void>,
    newStatus: Communication['status']
  ): Promise<void> => {
    try {
      await medplum.updateResource({ ...thread, status: newStatus });
      await refresh();
    } catch (error) {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    }
  };

  const handleNewTopicCompletion = (message: Communication): void => {
    pendingTopicsRef.current = [message, ...pendingTopicsRef.current];
    setRefreshKey((key) => key + 1);
    onNew(message);
  };

  const tabs: ResourceBoardTab[] = [
    { value: 'in-progress', label: 'In Progress', uri: inProgressUri },
    { value: 'completed', label: 'Completed', uri: completedUri },
  ];

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

  const renderItem = (item: Resource): JSX.Element => (
    <ThreadListItem
      topic={item as Communication}
      lastCommunication={item.id ? lastMessagesRef.current.get(item.id) : undefined}
      getThreadUri={getThreadUri}
    />
  );

  const renderDetail = (selected: Resource, ctx: ResourceBoardDetailContext): JSX.Element => {
    const thread = selected as Communication;
    return (
      <>
        {/* Main chat area */}
        <Flex direction="column" style={{ flex: 1 }} h="100%" className={classes.rightBorder}>
          <Stack h="100%" gap={0}>
            <Flex h={64} align="center" justify="space-between" p="md">
              <Text fw={800} truncate fz="lg">
                {thread.topic?.text ?? 'Messages'}
              </Text>

              <Menu position="bottom-end" shadow="md">
                <Menu.Target>
                  <Button
                    variant="light"
                    color={getStatusColor(thread.status)}
                    rightSection={thread.status === 'completed' ? undefined : <IconChevronDown size={16} />}
                    radius="xl"
                    size="sm"
                  >
                    {thread.status
                      .split('-')
                      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ')}
                  </Button>
                </Menu.Target>

                {thread.status !== 'completed' && (
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => handleStatusChange(thread, ctx.refresh, 'completed')}>
                      Completed
                    </Menu.Item>
                  </Menu.Dropdown>
                )}
              </Menu>
            </Flex>
            <Divider />
            <Flex direction="column" style={{ flex: 1 }} h="100%">
              <ThreadChat
                key={`${getReferenceString(thread)}`}
                title={'Messages'}
                thread={thread}
                excludeHeader={true}
                uploadEnabled={uploadEnabled}
                onViewInDocuments={onViewInDocuments}
              />
            </Flex>
          </Stack>
        </Flex>

        {/* Right sidebar - Patient summary */}
        {thread.subject && showPatientSummary && (
          <Flex direction="column" w={300} h="100%">
            <ScrollArea p={0} h="100%" scrollbarSize={10} type="hover" scrollHideDelay={250}>
              <PatientSummary key={thread.id} patient={thread.subject as Reference<Patient>} sections={sections} />
            </ScrollArea>
          </Flex>
        )}
      </>
    );
  };

  const handleError = (error: unknown): void => {
    showNotification({
      title: 'Error',
      message: normalizeErrorString(error),
      color: 'red',
    });
  };

  return (
    <>
      <div className={classes.container}>
        <ResourceBoard
          search={currentSearch}
          selectedId={threadId}
          loadItems={loadItems}
          resolveSelected={resolveSelected}
          listWidth={380}
          tabs={tabs}
          activeTab={status}
          headerActions={headerActions}
          renderItem={renderItem}
          skeleton={<ThreadInboxSkeleton />}
          emptyList={<EmptyMessagesState />}
          renderDetail={renderDetail}
          emptyDetail={<NoMessages />}
          onChange={onChange}
          onError={handleError}
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

const SKELETON_TITLE_WIDTHS = [80, 72, 68, 64];
const SKELETON_SUBTITLE_WIDTHS = [85, 78, 70, 60];

function ThreadInboxSkeleton(): JSX.Element {
  return (
    <Stack gap="md" p="md">
      {Array.from({ length: 10 }).map((_, index) => {
        const titleWidth = SKELETON_TITLE_WIDTHS[index % SKELETON_TITLE_WIDTHS.length];
        const subtitleWidth = SKELETON_SUBTITLE_WIDTHS[index % SKELETON_SUBTITLE_WIDTHS.length];
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
