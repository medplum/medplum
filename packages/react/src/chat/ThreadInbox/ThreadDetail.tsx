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

/**
 * Props for the ThreadDetail component.
 * @param thread - The selected thread (parent Communication) to display.
 * @param showPatientSummary - Whether to show the patient summary sidebar.
 * @param sections - Optional sections configuration for the patient summary.
 * @param uploadEnabled - Whether to show the attachment upload button in the chat input.
 * @param onViewInDocuments - When provided, shows a "View in Documents" action on attachment messages that invokes this callback with the attachment's DocumentReference.
 * @param onStatusChange - Fired when the user changes the thread status from the header menu.
 * @param onOpenSettings - When provided, shows a Message Settings button in the header that invokes this callback.
 */
export interface ThreadDetailProps {
  readonly thread: Communication;
  readonly showPatientSummary?: boolean;
  readonly sections?: PatientSummarySectionConfig[];
  readonly uploadEnabled?: boolean;
  readonly onViewInDocuments?: (reference: Reference<DocumentReference>) => void;
  readonly onStatusChange: (status: Communication['status']) => void;
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
