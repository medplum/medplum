import { Group, Loader, Stack, Text } from '@mantine/core';
import { Communication } from '@medplum/fhirtypes';
import { JSX, useState } from 'react';
import { MessageThreadListItem } from './MessageThreadListItem';

interface ChatListProps {
  communications: Communication[];
}

export const ChatList = (props: ChatListProps): JSX.Element => {
  const { communications } = props;
  const [validPatientThreads, setValidPatientThreads] = useState<string[]>([]);
  const [paginatedThreads, setPaginatedThreads] = useState<{ patientRef: string; comm: Communication }[]>([]);
  const [selectedPatientRef, setSelectedPatientRef] = useState<string | null>(null);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});

  if (communications.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          minHeight: 0,
          flex: 1,
        }}
      >
        <Loader />
      </div>
    );
  } else if (validPatientThreads.length === 0) {
    return (
      <Group mt={16} ml={16}>
        <Text>No messages found.</Text>
      </Group>
    );
  } else {
    return (
      <Stack gap={0} style={{ padding: '8px' }}>
        {paginatedThreads.map(({ patientRef, comm }: { patientRef: string; comm: Communication }, i: number) => {
          const displayName = getThreadLabel(patientRef);
          const isSelected = selectedPatientRef === patientRef;
          const isAboveSelected =
            paginatedThreads[i + 1] && paginatedThreads[i + 1].patientRef === selectedPatientRef;

          // Prefetch on render for visible threads
          // if (!isSelected && !prefetchedPatients[patientRef]) {
          //   prefetchPatient(patientRef);
          // }

          return (
            <MessageThreadListItem
              key={patientRef}
              patientRef={patientRef}
              communication={comm}
              displayName={displayName}
              isSelected={isSelected}
              isAboveSelected={isAboveSelected}
              participantNames={participantNames}
              onClick={() => setSelectedPatientRef(patientRef)}
              onHover={() => prefetchPatient(patientRef)}
            />
          );
        })}
      </Stack>
    );
  }
};