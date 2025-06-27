import { Group, Stack, Text } from '@mantine/core';
import { Communication, HumanName, Patient, Reference } from '@medplum/fhirtypes';
import { ResourceAvatar, useResource } from '@medplum/react';
import { JSX } from 'react';
import { formatDateTime, formatHumanName } from '@medplum/core';
import classes from './ChatListItem.module.css';
import cx from 'clsx';

interface ChatListItemProps {
  topic: Communication;
  lastCommunication: Communication | undefined;
  isSelected: boolean;
  onClick: () => void;
}

export const ChatListItem = (props: ChatListItemProps): JSX.Element => {
  const { topic, lastCommunication, isSelected, onClick } = props;
  const patientResource = useResource(topic.subject as Reference<Patient>);
  const patientName = formatHumanName(patientResource?.name?.[0] as HumanName);
  const lastMsg = lastCommunication?.payload?.[0]?.contentString || 'No preview';
  const content = lastMsg.length > 100 ? lastMsg.slice(0, 100) + '...' : lastMsg;

  return (
    <Group
      p="xs"
      key={topic.id}
      align="center"
      wrap="nowrap"
      className={cx(classes.contentContainer, {
        [classes.selected]: isSelected,
      })}
      onClick={onClick}
    >
      <ResourceAvatar value={topic.subject as Reference<Patient>} radius="xl" size={36} />
      <Stack gap={0}>
        <Text size="sm" fw={700} truncate="end">
          {patientName}
        </Text>
        <Text size="sm" fw={400} c="gray.7" lineClamp={2} className={classes.content}>
          {content}
        </Text>
        <Text size="xs" c="gray.6" style={{ marginTop: 2 }}>
          {lastCommunication ? formatDateTime(lastCommunication.sent) : ''}
        </Text>
      </Stack>
    </Group>
  );
};
