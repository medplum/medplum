// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDateTime, formatHumanName } from '@medplum/core';
import type { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { ListItem } from '../../List/ListItem';
import { ResourceAvatar } from '../../ResourceAvatar/ResourceAvatar';

export interface ChatListItemProps {
  topic: Communication;
  lastCommunication: Communication | undefined;
  isSelected: boolean;
  getThreadUri: (topic: Communication) => string;
}

export const ChatListItem = (props: ChatListItemProps): JSX.Element => {
  const { topic, lastCommunication, isSelected, getThreadUri } = props;
  const patientResource = useResource(topic.subject as Reference<Patient>);
  const patientName = formatHumanName(patientResource?.name?.[0]);
  const lastMsg = lastCommunication?.payload?.[0]?.contentString;
  const trimmedMsg = lastMsg?.length && lastMsg.length > 100 ? lastMsg.slice(0, 100) + '...' : lastMsg;
  const senderName = lastCommunication?.sender?.display ? `${lastCommunication?.sender?.display}: ` : '';
  const content = trimmedMsg ? `${senderName} ${trimmedMsg}` : `No messages available`;
  const topicName = topic.topic?.text ?? content;

  return (
    <ListItem to={getThreadUri(topic)} selected={isSelected}>
      <Group align="center" wrap="nowrap" gap="sm">
        <ResourceAvatar value={topic.subject} radius="xl" size={36} />
        <Stack gap={0} flex={1} miw={0}>
          <Text size="sm" fw={700} truncate="end">
            {patientName}
          </Text>
          <Text size="sm" fw={400} truncate="end">
            {topicName}
          </Text>
          <Text size="xs" c="dimmed" fw={500}>
            {lastCommunication ? formatDateTime(lastCommunication.sent) : ''}
          </Text>
        </Stack>
      </Group>
    </ListItem>
  );
};
