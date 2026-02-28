// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, formatCodeableConcept, getReferenceString } from '@medplum/core';
import type { Communication, CommunicationPayload, DocumentReference, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, usePrevious } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BaseChat } from '../BaseChat/BaseChat';

export interface ThreadChatProps {
  readonly thread: Communication;
  readonly title?: string;
  readonly onMessageSent?: (message: Communication) => void;
  readonly inputDisabled?: boolean;
  readonly excludeHeader?: boolean;
  readonly uploadEnabled?: boolean;
  readonly onError?: (err: Error) => void;
  readonly onViewInDocuments?: (reference: Reference<DocumentReference>) => void;
}

export function ThreadChat(props: ThreadChatProps): JSX.Element | null {
  const { thread, title, onMessageSent, inputDisabled, excludeHeader, uploadEnabled, onError, onViewInDocuments } =
    props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const prevThreadId = usePrevious<string | undefined>(thread?.id);
  const [communications, setCommunications] = useState<Communication[]>([]);

  const profileRef = useMemo(() => (profile ? createReference(profile) : undefined), [profile]);
  const threadRef = useMemo(() => createReference(thread), [thread]);

  useEffect(() => {
    if (thread?.id !== prevThreadId) {
      setCommunications([]);
    }
  }, [thread?.id, prevThreadId]);

  const sendMessage = useCallback(
    (message: string, file?: File, existingDocRef?: DocumentReference) => {
      const profileRefStr = profileRef ? getReferenceString(profileRef) : undefined;
      if (!profileRefStr) {
        return;
      }

      const buildAndSend = async (): Promise<void> => {
        const payload: CommunicationPayload[] = [];
        if (message) {
          payload.push({ contentString: message });
        }
        if (existingDocRef) {
          payload.push({ contentReference: createReference(existingDocRef) });
        } else if (file) {
          const docRef = await medplum.createDocumentReference({
            data: file,
            contentType: file.type || 'application/octet-stream',
            filename: file.name,
            additionalFields: thread.subject ? { subject: thread.subject } : undefined,
          });
          payload.push({ contentReference: createReference(docRef) });
        }
        const communication = await medplum.createResource<Communication>({
          resourceType: 'Communication',
          status: 'in-progress',
          sender: profileRef,
          recipient: thread.recipient?.filter((ref) => getReferenceString(ref) !== profileRefStr) ?? [],
          sent: new Date().toISOString(),
          payload,
          partOf: [threadRef],
        });
        setCommunications([...communications, communication]);
        onMessageSent?.(communication);
      };

      buildAndSend().catch(console.error);
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
                .updateResource({
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
      title={title ?? (thread?.topic ? formatCodeableConcept(thread.topic) : '[No thread title]')}
      communications={communications}
      setCommunications={setCommunications}
      query={`part-of=Communication/${thread.id as string}`}
      sendMessage={sendMessage}
      onMessageReceived={onMessageReceived}
      inputDisabled={inputDisabled}
      excludeHeader={excludeHeader}
      uploadEnabled={uploadEnabled}
      onError={onError}
      attachmentSubjectRef={thread.subject}
      onViewInDocuments={onViewInDocuments}
    />
  );
}
