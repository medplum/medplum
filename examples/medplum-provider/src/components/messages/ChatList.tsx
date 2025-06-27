import { Stack } from '@mantine/core';
import { Communication } from '@medplum/fhirtypes';
import { JSX, useEffect, useState } from 'react';
import { ChatListItem } from './ChatListItem';
import { createReference, getReferenceString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { showErrorNotification } from '../../utils/notifications';

interface ChatListProps {
  communications: Communication[];
  selectedCommunication: Communication | undefined;
  onClick: (communication: Communication) => void;
}

export const ChatList = (props: ChatListProps): JSX.Element => {
  const { communications, selectedCommunication, onClick } = props;
  const medplum = useMedplum();
  const [lastCommunications, setLastCommunications] = useState<
    { id: string; communication: Communication }[] | undefined
  >(undefined);

  useEffect(() => {
    const fetchLastCommunications = async (): Promise<void> => {
      const communicationReferences = communications.map((communication) => createReference(communication));
      const allCommunications = await medplum.graphql(`
        query {
          CommunicationList(
            _sort: "-sent"
            _filter: "part-of eq ${communicationReferences.map((ref) => getReferenceString(ref)).join(' or part-of eq ')}"
          ) {
            id
            partOf {
              reference
            }
            payload {
              contentString
            }
            status
          }
        }
      `);
      const lastCommunications = allCommunications.data.CommunicationList.map((communication: Communication) => {
        return {
          id: communication.partOf?.[0]?.reference?.split('/')[1],
          communication: communication,
        };
      });

      setLastCommunications(lastCommunications);
    };

    fetchLastCommunications().catch((error) => {
      showErrorNotification(error);
    });
  }, [communications, medplum]);

  return (
    <Stack gap={0} p="xs">
      {communications.map((communication: Communication) => {
        const lastCommunication = lastCommunications?.find((lc) => lc.id === communication.id)?.communication;
        if (!lastCommunication) {
          return null;
        }
        const _isSelected = selectedCommunication?.id === communication.id;
        return (
          <ChatListItem
            key={communication.id}
            topic={communication}
            lastCommunication={lastCommunication}
            isSelected={_isSelected}
            onClick={() => {
              onClick(communication);
            }}
          />
        );
      })}
    </Stack>
  );
};
