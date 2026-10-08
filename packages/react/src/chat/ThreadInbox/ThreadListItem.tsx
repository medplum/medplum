// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDateTime, formatHumanName } from '@medplum/core';
import type { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { MedplumLink } from '../../MedplumLink/MedplumLink';
import { ResourceAvatar } from '../../ResourceAvatar/ResourceAvatar';
import classes from './ThreadListItem.module.css';

export interface ThreadListItemProps {
  topic: Communication;
  lastCommunication: Communication | undefined;
  getThreadUri: (topic: Communication) => string;
}

// Content-only row: the surrounding ListWithDetailPane `.item` wrapper owns the
// hover/selected chrome, so this renders just the link and its contents.
export const ThreadListItem = (props: ThreadListItemProps): JSX.Element => {
  const { topic, lastCommunication, getThreadUri } = props;
  const patientResource = useResource(topic.subject as Reference<Patient>);
  const patientName = formatHumanName(patientResource?.name?.[0]);
  const lastMsg = lastCommunication?.payload?.[0]?.contentString;
  const trimmedMsg = lastMsg?.length && lastMsg.length > 100 ? lastMsg.slice(0, 100) + '...' : lastMsg;
  const senderName = lastCommunication?.sender?.display ? `${lastCommunication?.sender?.display}: ` : '';
  const content = trimmedMsg ? `${senderName} ${trimmedMsg}` : `No messages available`;
  const topicName = topic.topic?.text ?? content;

  return (
    <MedplumLink to={getThreadUri(topic)} underline="never" display="block" c="inherit">
      <Group p="xs" align="center" wrap="nowrap">
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
