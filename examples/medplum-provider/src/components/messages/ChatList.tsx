import { Stack } from '@mantine/core';
import { Communication } from '@medplum/fhirtypes';
import { JSX, useState } from 'react';
import { ChatListItem } from './ChatListItem';

interface ChatListProps {
  communications: Communication[];
  onClick: (patientRef: string) => void;
}

export const ChatList = (props: ChatListProps): JSX.Element => {
  const { communications } = props;
  // const [paginatedThreads, setPaginatedThreads] = useState<{ patientRef: string; comm: Communication }[]>([]);
  const [selectedPatientRef, setSelectedPatientRef] = useState<string | null>(null);

  // const getThreadLabel = useCallback(
  //   (patientRef: string) => {
  //     return participantNames[patientRef] || patientRef;
  //   },
  //   [participantNames]
  // );

  return (
    <Stack gap={0} style={{ padding: '8px' }}>
      {communications.map((communication: Communication) => {
        const patientRef = communication.sender?.reference || communication.recipient?.[0]?.reference || '';
    
        const _isSelected = selectedPatientRef === patientRef;
        // const _isAboveSelected = paginatedThreads[i + 1] && paginatedThreads[i + 1].patientRef === selectedPatientRef;

        // Prefetch on render for visible threads
        // if (!isSelected && !prefetchedPatients[patientRef]) {
        //   prefetchPatient(patientRef);
        // }

        return (
          <ChatListItem
            key={patientRef}
            patientRef={patientRef}
            communication={communication}
            isSelected={_isSelected}
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
