import { Communication } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MessagePage } from '../components/MessagePage';
import { ThreadPage } from '../components/ThreadPage';

export function CommunicationPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [communication, setCommunication] = useState<Communication>();
  const [isThread, setIsThread] = useState<boolean>();

  const onCommunicationChange = (newCommunication: Communication) => {
    setCommunication(newCommunication);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (id) {
          const communication = await medplum.readResource('Communication', id);
          setCommunication(communication);
          setIsThread(communication.partOf ? false : true);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchData();
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
