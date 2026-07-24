// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Flex,
  Group,
  Menu,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { Communication, DocumentReference, Patient, Reference } from '@medplum/fhirtypes';
import { IconChevronDown, IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { PatientSummary } from '../../PatientSummary/PatientSummary';
import type { PatientSummarySectionConfig } from '../../PatientSummary/PatientSummary.types';
import { ThreadChat } from '../ThreadChat/ThreadChat';
import classes from './ThreadDetail.module.css';

export interface ThreadDetailProps {
  /** The selected thread (parent Communication) to display. */
  readonly thread: Communication;
  /** Whether to show the patient summary sidebar. */
  readonly showPatientSummary?: boolean;
  /** Optional sections configuration for the patient summary. */
  readonly sections?: PatientSummarySectionConfig[];
  readonly uploadEnabled?: boolean;
  readonly onViewInDocuments?: (reference: Reference<DocumentReference>) => void;
  /** Fired when the user changes the thread status from the header menu. */
  readonly onStatusChange: (status: Communication['status']) => void;
  /** When provided, shows a Message Settings button in the header that invokes this callback. */
  readonly onOpenSettings?: () => void;
}

/**
 * ThreadDetail renders the detail pane of the ThreadInbox: the thread header with a
 * status menu, the chat thread, and an optional patient summary sidebar.
 * @param props - The ThreadDetail React props.
 * @returns The ThreadDetail React node.
 */
export function ThreadDetail(props: ThreadDetailProps): JSX.Element {
  const {
    thread,
    showPatientSummary = false,
    sections,
    uploadEnabled,
    onViewInDocuments,
    onStatusChange,
    onOpenSettings,
  } = props;

  return (
    <>
      {/* Main chat area */}
      <Flex direction="column" style={{ flex: 1 }} h="100%" className={classes.rightBorder}>
        <Paper h="100%">
          <Stack h="100%" gap={0}>
            <Flex h={64} align="center" justify="space-between" p="md">
              <Text fw={800} truncate fz="lg">
                {thread.topic?.text ?? 'Messages'}
              </Text>

              <Group gap="xs">
                {onOpenSettings && (
                  <Tooltip label="Message Settings" position="bottom" openDelay={500}>
                    <ActionIcon
                      aria-label="Message settings"
                      variant="transparent"
                      radius="xl"
                      size={32}
                      className="outline-icon-button"
                      onClick={onOpenSettings}
                    >
                      <IconInfoCircle size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}

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
                      <Menu.Item onClick={() => onStatusChange('completed')}>Completed</Menu.Item>
                    </Menu.Dropdown>
                  )}
                </Menu>
              </Group>
            </Flex>
            <Divider />
            <Box flex={1} h="100%">
              <ThreadChat
                key={`${getReferenceString(thread)}`}
                title={'Messages'}
                thread={thread}
                excludeHeader={true}
                uploadEnabled={uploadEnabled}
                onViewInDocuments={onViewInDocuments}
              />
            </Box>
          </Stack>
        </Paper>
      </Flex>

      {/* Right sidebar - Patient summary */}
      {thread.subject && showPatientSummary && (
        <Box w={300} h="100%">
          <ScrollArea p={0} h="100%" scrollbarSize={10} type="hover" scrollHideDelay={250}>
            <PatientSummary key={thread.id} patient={thread.subject as Reference<Patient>} sections={sections} />
          </ScrollArea>
        </Box>
      )}
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
