import { Stack } from '@mantine/core';
import { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { JSX } from 'react';
import { ChatListItem } from './ChatListItem';


interface ChatListProps {
  communications: Communication[];
  selectedPatient: Reference<Patient>;
  onClick: (patient: Reference<Patient>) => void;
}

export const ChatList = (props: ChatListProps): JSX.Element => {
  const { communications, selectedPatient, onClick } = props;

  return (
    <Stack gap={0} style={{ padding: '8px' }}>
      {communications.map((communication: Communication) => {
        const patient = (communication.sender || communication.recipient?.[0]) as Reference<Patient>;
        const _isSelected = selectedPatient === patient;
        // const _isAboveSelected = paginatedThreads[i + 1] && paginatedThreads[i + 1].patientRef === selectedPatientRef;

        // Prefetch on render for visible threads
        // if (!isSelected && !prefetchedPatients[patientRef]) {
        //   prefetchPatient(patientRef);
        // }

        return (
          <ChatListItem
            key={communication.id}
            patient={patient}
            communication={communication}
            isSelected={_isSelected}
            onClick={() => {
              onClick(patient);
            }}
          />

        );
      })}
    </Stack>
  );
};
