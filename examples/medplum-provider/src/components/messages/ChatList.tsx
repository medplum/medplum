import { Group, Loader, Stack, Text } from '@mantine/core';
import { Communication } from '@medplum/fhirtypes';
import { JSX, useCallback, useState } from 'react';
import { ChatListItem } from './ChatListItem';

interface ChatListProps {
  communications: Communication[];
  onClick: (patientRef: string) => void;
}

export const ChatList = (props: ChatListProps): JSX.Element => {
  const { communications } = props;
  const [paginatedThreads, setPaginatedThreads] = useState<{ patientRef: string; comm: Communication }[]>([]);
  const [selectedPatientRef, setSelectedPatientRef] = useState<string | null>(null);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});

  const getThreadLabel = useCallback(
    (patientRef: string) => {
      return participantNames[patientRef] || patientRef;
    },
    [participantNames]
  );

  return (
    <Stack gap={0} style={{ padding: '8px' }}>
      {communications.map((communication: Communication, i: number) => {
        const patientRef = communication.sender?.reference || communication.recipient?.[0]?.reference || '';
        const _displayName = getThreadLabel(patientRef);
        const _isSelected = selectedPatientRef === patientRef;
        const _isAboveSelected = paginatedThreads[i + 1] && paginatedThreads[i + 1].patientRef === selectedPatientRef;

        // Prefetch on render for visible threads
        // if (!isSelected && !prefetchedPatients[patientRef]) {
        //   prefetchPatient(patientRef);
        // }

        return (
          <ChatListItem
            key={patientRef}
            patientRef={patientRef}
            communication={communication}
            displayName={_displayName}
            isSelected={_isSelected}
            isAboveSelected={_isAboveSelected}
            // participantNames={participantNames}
            onClick={() => {
              setSelectedPatientRef(patientRef);
              props.onClick(patientRef);
            }}
            // onHover={() => prefetchPatient(patientRef)}
          />

        );
      })}
    </Stack>
  );
};
