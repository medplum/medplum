import { Group, Text } from '@mantine/core';
import { Communication } from '@medplum/fhirtypes';
import { ResourceAvatar } from '@medplum/react';
import { JSX } from 'react';

interface MessageThreadListItemProps {
  communication: Communication;
  patientRef: string;
  displayName: string;
  isSelected: boolean;
  isAboveSelected: boolean;
}
export const MessageThreadListItem = (props: MessageThreadListItemProps): JSX.Element => {
  const { communication, patientRef, displayName, isSelected, isAboveSelected } = props;
  const lastMsg = communication.payload?.[0]?.contentString || 'No preview';
  const lastTime = communication.sent ? new Date(communication.sent) : undefined;
  let timeStr = '';
  if (lastTime) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const dayOfWeek = days[lastTime.getDay()];
    const month = months[lastTime.getMonth()];
    const day = lastTime.getDate();
    let hours = lastTime.getHours();
    const minutes = lastTime.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) {
      hours = 12;
    }
    const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    timeStr = `${hours}:${minutesStr} ${ampm} on ${dayOfWeek}, ${month} ${day}`;
  }
  return (
    <div key={patientRef} style={{ position: 'relative' }}>
      <Group
        align="center"
        wrap="nowrap"
        className={!isSelected ? 'message-list-item' : undefined}
        style={{
          cursor: 'pointer',
          background: isSelected ? 'var(--mantine-color-gray-2)' : undefined,
          borderRadius: 8,
          padding: '12px 8px',
          transition: 'background 0.2s',
        }}
        // onClick={onClick}
        // onMouseEnter={onHover}
      >
        <ResourceAvatar value={{ reference: patientRef }} radius="xl" size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={700} truncate="end">
            {displayName}
          </Text>
          <Text size="sm" fw={400} c="gray.7" truncate="end" lineClamp={1}>
            {/* {communication.sender?.reference && participantNames[communication.sender.reference]?.split(' ')[0] ? (
              <>{participantNames[communication.sender.reference].split(' ')[0]}: </>
            ) : null} */}
            {lastMsg}
          </Text>
          <Text size="xs" c="gray.6" style={{ marginTop: 2 }}>
            {timeStr}
          </Text>
        </div>
      </Group>
      <div
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: 0,
          height: 0,
          borderBottom: isSelected || isAboveSelected ? 'none' : '1px solid #EEE',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

