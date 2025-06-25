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
    <Stack gap={0} p="xs">
      {communications.map((communication: Communication) => {
        const patient = communication.subject as Reference<Patient>;
        const _isSelected = selectedPatient.reference === patient.reference;
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
