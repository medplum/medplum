import { ProfileResource, createReference } from '@medplum/core';
import { Communication } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react-hooks';
import { useCallback, useMemo, useState } from 'react';
import { ChatBox } from '../ChatBox/ChatBox';

export interface ChatProps {
  title: string;
  thread: Communication;
}

export function Chat(props: ChatProps): JSX.Element | null {
  const { title, thread } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [communications, setCommunications] = useState<Communication[]>([]);

  const profileRef = useMemo(() => createReference(profile as ProfileResource), [profile]);
  const threadRef = useMemo(() => createReference(thread), [thread]);

  const sendMessage = useCallback(
    (message: string) => {
      medplum
        .createResource<Communication>({
          resourceType: 'Communication',
          status: 'in-progress',
          // subject: createReference(resource),
          sender: profileRef,
          recipient: [],
          sent: new Date().toISOString(),
          payload: [{ contentString: message }],
          partOf: [threadRef],
        })
        .then((communication) => setCommunications([...communications, communication]))
        .catch(console.error);
    },
    [medplum, profileRef, threadRef, communications]
  );

  if (!profile) {
    return null;
  }

  return (
    <ChatBox
      title={title}
      communications={communications}
      setCommunications={setCommunications}
      query={`part-of=Communication/${thread.id as string}`}
      sendMessage={sendMessage}
    />
  );
}
