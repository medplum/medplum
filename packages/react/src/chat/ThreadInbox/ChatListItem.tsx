// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDateTime, formatHumanName } from '@medplum/core';
import type { Communication, HumanName, Patient, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import cx from 'clsx';
import type { JSX } from 'react';
import { MedplumLink } from '../../MedplumLink/MedplumLink';
import { ResourceAvatar } from '../../ResourceAvatar/ResourceAvatar';
import classes from './ChatListItem.module.css';

interface ChatListItemProps {
  topic: Communication;
  lastCommunication: Communication | undefined;
  isSelected: boolean;
  getThreadUri: (topic: Communication) => string;
}

export const ChatListItem = (props: ChatListItemProps): JSX.Element => {
  const { topic, lastCommunication, isSelected, getThreadUri } = props;
  const patientResource = useResource(topic.subject as Reference<Patient>);
  const patientName = formatHumanName(patientResource?.name?.[0] as HumanName);
  const lastMsg = lastCommunication?.payload?.[0]?.contentString;
  const trimmedMsg = lastMsg?.length && lastMsg.length > 100 ? lastMsg.slice(0, 100) + '...' : lastMsg;
  const senderName = lastCommunication?.sender?.display ? `${lastCommunication?.sender?.display}: ` : '';
  const content = trimmedMsg ? `${senderName} ${trimmedMsg}` : `No messages available`;
  const topicName = topic.topic?.text ?? content;

  return (
    <MedplumLink to={getThreadUri(topic)} underline="never">
      <Group
        p="xs"
        align="center"
        wrap="nowrap"
        className={cx(classes.contentContainer, {
          [classes.selected]: isSelected,
        })}
      >
        <ResourceAvatar value={topic.subject as Reference<Patient>} radius="xl" size={36} />
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
