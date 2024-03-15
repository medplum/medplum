import { ProfileResource, createReference, getReferenceString } from '@medplum/core';
import { Communication } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, usePrevious } from '@medplum/react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BaseChat } from '../BaseChat/BaseChat';

export interface ThreadChatProps {
  readonly title: string;
  readonly thread: Communication;
  readonly open?: boolean;
  readonly onMessageSent?: (message: Communication) => void;
}

export function ThreadChat(props: ThreadChatProps): JSX.Element | null {
  const { title, thread, open, onMessageSent } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const prevThreadId = usePrevious<string | undefined>(thread?.id);
  const [communications, setCommunications] = useState<Communication[]>([]);

  const profileRef = useMemo(() => (profile ? createReference(profile as ProfileResource) : undefined), [profile]);
  const threadRef = useMemo(() => createReference(thread), [thread]);

  useEffect(() => {
    if (thread?.id !== prevThreadId) {
      setCommunications([]);
    }
  }, [thread?.id, prevThreadId]);

  const sendMessage = useCallback(
    (message: string) => {
      const profileRefStr = profileRef ? getReferenceString(profileRef) : undefined;
      if (!profileRefStr) {
        return;
      }
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
        .then((communication) => {
          setCommunications([...communications, communication]);
          onMessageSent?.(communication);
        })
        .catch(console.error);
    },
    [medplum, profileRef, thread, threadRef, communications, onMessageSent]
  );

  // Currently we only support `delivered` on chats with 2 participants
  // Normally we would use `useCallback` to memoize a function
  // But in this case we only want to conditionally pass a function if the thread has 2 participants...
  // If the thread has 3 or more participants, we do not pass this function; instead we pass undefined
  const onMessageReceived = useMemo(
    () =>
      thread.recipient?.length === 2
        ? (message: Communication): void => {
            if (!(message.received && message.status === 'completed')) {
              medplum
                .updateResource<Communication>({
                  ...message,
                  received: message.received ?? new Date().toISOString(), // Mark as received if needed
                  status: 'completed', // Mark as 'read'
                  // See: https://www.medplum.com/docs/communications/organizing-communications#:~:text=THE%20Communication%20LIFECYCLE
                  // for more info about recommended `Communication` lifecycle
                })
                .catch(console.error);
            }
          }
        : undefined,
    [medplum, thread.recipient?.length]
  );

  if (!profile) {
    return null;
  }

  return (
    <BaseChat
      title={title}
      communications={communications}
      setCommunications={setCommunications}
      query={`part-of=Communication/${thread.id as string}`}
      sendMessage={sendMessage}
      onMessageReceived={onMessageReceived}
      open={open}
    />
  );
}
