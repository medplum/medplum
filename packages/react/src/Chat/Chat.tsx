import { ProfileResource, createReference, getReferenceString } from '@medplum/core';
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
      const profileRefStr = getReferenceString(profileRef);
      medplum
        .createResource<Communication>({
          resourceType: 'Communication',
          status: 'in-progress',
          sender: profileRef,
          recipient: thread.recipient?.filter((ref) => getReferenceString(ref) !== profileRefStr) ?? [],
          sent: new Date().toISOString(),
          payload: [{ contentString: message }],
          partOf: [threadRef],
        })
        .then((communication) => setCommunications([...communications, communication]))
        .catch(console.error);
    },
    [medplum, profileRef, thread, threadRef, communications]
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
