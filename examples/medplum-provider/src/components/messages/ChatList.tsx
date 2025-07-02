import { Stack } from '@mantine/core';
import { Communication } from '@medplum/fhirtypes';
import { JSX, useEffect, useState, useMemo } from 'react';
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
  const [lastCommunications, setLastCommunications] = useState<Communication[] | undefined>(undefined);

  const communicationReferences = useMemo(() => communications.map((c) => createReference(c)), [communications]);

  useEffect(() => {
    const fetchLastCommunications = async (): Promise<void> => {
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
      const lastCommunications = allCommunications.data.CommunicationList;
      setLastCommunications(lastCommunications);
    };

    fetchLastCommunications().catch(showErrorNotification);
  }, [communicationReferences, medplum]);

  // Create a Map for O(1) lookup by partOf reference
  const lastCommunicationsMap = useMemo(() => {
    if (!lastCommunications) {
      return new Map<string, Communication>();
    }

    const map = new Map<string, Communication>();
    lastCommunications.forEach((comm) => {
      const partOfRef = comm.partOf?.[0]?.reference;
      if (partOfRef) {
        if (!map.has(partOfRef)) {
          map.set(partOfRef, comm);
        }
      }
    });
    return map;
  }, [lastCommunications]);

  return (
    <Stack gap={0} p="xs">
      {communications.map((communication: Communication) => {
        const lastCommunication = lastCommunicationsMap.get(createReference(communication).reference);
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
