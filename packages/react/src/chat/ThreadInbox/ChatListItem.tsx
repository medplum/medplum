// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDateTime, formatHumanName } from '@medplum/core';
import type { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import cx from 'clsx';
import type { JSX } from 'react';
import { MedplumLink } from '../../MedplumLink/MedplumLink';
import { ResourceAvatar } from '../../ResourceAvatar/ResourceAvatar';
import classes from './ChatListItem.module.css';

export interface ChatListItemProps {
  topic: Communication;
  lastCommunication: Communication | undefined;
  isSelected: boolean;
  getThreadUri: (topic: Communication) => string;
  /**
   * Class for the root link element, e.g. ResourceBoard's `ctx.className`.
   * When provided it replaces the built-in container styling (padding and
   * hover/selected backgrounds), which are expected to come from the class.
   */
  className?: string;
}

export const ChatListItem = (props: ChatListItemProps): JSX.Element => {
  const { topic, lastCommunication, isSelected, getThreadUri, className } = props;
  const patientResource = useResource(topic.subject as Reference<Patient>);
  const patientName = formatHumanName(patientResource?.name?.[0]);
  const lastMsg = lastCommunication?.payload?.[0]?.contentString;
  const trimmedMsg = lastMsg?.length && lastMsg.length > 100 ? lastMsg.slice(0, 100) + '...' : lastMsg;
  const senderName = lastCommunication?.sender?.display ? `${lastCommunication?.sender?.display}: ` : '';
  const content = trimmedMsg ? `${senderName} ${trimmedMsg}` : `No messages available`;
  const topicName = topic.topic?.text ?? content;

  return (
    <MedplumLink to={getThreadUri(topic)} underline="never" className={className}>
      <Group
        p={className ? undefined : 'xs'}
        align="center"
        wrap="nowrap"
        className={
          className
            ? undefined
            : cx(classes.contentContainer, {
                [classes.selected]: isSelected,
              })
        }
      >
        <ResourceAvatar value={topic.subject} radius="xl" size={36} />
        <Stack gap={0}>
          <Text size="sm" fw={700} truncate="end">
            {patientName}
          </Text>
          <Text size="sm" fw={400} lineClamp={2} className={classes.content}>
            {topicName}
          </Text>
          <Text size="xs" style={{ marginTop: 2 }}>
            {lastCommunication ? formatDateTime(lastCommunication.sent) : ''}
          </Text>
        </Stack>
      </Group>
    </MedplumLink>
  );
};
