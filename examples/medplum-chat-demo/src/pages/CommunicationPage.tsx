import { Communication } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MessagePage } from './MessagePage';
import { ThreadPage } from './ThreadPage';

export function CommunicationPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [communication, setCommunication] = useState<Communication>();
  const [isThread, setIsThread] = useState<boolean>();

  function onCommunicationChange(newCommunication: Communication): void {
    setCommunication(newCommunication);
  }

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        if (id) {
          const communication = await medplum.readResource('Communication', id);
          setCommunication(communication);

          // If the Communication is a part of another communication, it is a message, otherwise it is a thread. For more details see https://www.medplum.com/docs/communications/organizing-communications
          setIsThread(communication.partOf ? false : true); // eslint-disable-line no-unneeded-ternary
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchData().catch(console.error);
  });

  if (!communication) {
    return <Loading />;
  }

  return (
    <div>
      {isThread ? (
        <ThreadPage thread={communication} onChange={onCommunicationChange} />
      ) : (
        <MessagePage message={communication} onChange={onCommunicationChange} />
      )}
    </div>
  );
}
