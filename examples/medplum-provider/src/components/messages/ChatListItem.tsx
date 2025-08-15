// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { Communication, HumanName, Patient, Reference } from '@medplum/fhirtypes';
import { MedplumLink, ResourceAvatar, useResource } from '@medplum/react';
import { JSX } from 'react';
import { formatDateTime, formatHumanName } from '@medplum/core';
import classes from './ChatListItem.module.css';
import cx from 'clsx';

interface ChatListItemProps {
  topic: Communication;
  lastCommunication: Communication | undefined;
  isSelected: boolean;
}

export const ChatListItem = (props: ChatListItemProps): JSX.Element => {
  const { topic, lastCommunication, isSelected } = props;
  const patientResource = useResource(topic.subject as Reference<Patient>);
  const patientName = formatHumanName(patientResource?.name?.[0] as HumanName);
  const lastMsg = lastCommunication?.payload?.[0]?.contentString;
  const content = lastMsg?.length && lastMsg.length > 100 ? lastMsg.slice(0, 100) + '...' : lastMsg;

  return (
    <MedplumLink to={`/Message/${topic.id}`} c="dark">
      <Group
        p="xs"
        key={topic.id}
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
          <Text size="sm" fw={400} c="gray.7" lineClamp={2} className={classes.content}>
            {content ? `${lastCommunication?.sender?.display}: ${content}` : `No messages available`}
          </Text>
          <Text size="xs" c="gray.6" style={{ marginTop: 2 }}>
            {lastCommunication ? formatDateTime(lastCommunication.sent) : ''}
          </Text>
        </Stack>
      </Group>
    </MedplumLink>
  );
};
