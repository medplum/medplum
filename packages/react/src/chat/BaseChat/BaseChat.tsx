import { ActionIcon, Group, Paper, PaperProps, ScrollArea, Stack, TextInput, Title } from '@mantine/core';
import { useResizeObserver } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { ProfileResource, getDisplayString, getReferenceString, normalizeErrorString } from '@medplum/core';
import { Bundle, Communication, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource, useSubscription } from '@medplum/react-hooks';
import { IconArrowRight } from '@tabler/icons-react';
import cx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form } from '../../Form/Form';
import { ResourceAvatar } from '../../ResourceAvatar/ResourceAvatar';
import classes from './BaseChat.module.css';

function parseSentTime(communication: Communication): string {
  const sentTime = new Date(communication.sent ?? 0);
  const sentTimeMins = sentTime.getMinutes().toString();
  return `${sentTime.getHours()}:${sentTimeMins.length === 1 ? '0' : ''}${sentTimeMins}`;
}

function upsertCommunications(
  communications: Communication[],
  received: Communication[],
  setCommunications: (communications: Communication[]) => void
): void {
  const newCommunications = [...communications];
  let foundNew = false;
  for (const comm of received) {
    const existingIdx = newCommunications.findIndex((c) => c.id === comm.id);
    if (existingIdx !== -1) {
      newCommunications[existingIdx] = comm;
    } else {
      newCommunications.push(comm);
      foundNew = true;
    }
  }

  if (foundNew) {
    newCommunications.sort((a, b) => (a.sent as string).localeCompare(b.sent as string));
  }

  setCommunications(newCommunications);
}

export interface BaseChatProps extends PaperProps {
  readonly title: string;
  readonly communications: Communication[];
  readonly setCommunications: (communications: Communication[]) => void;
  readonly query: string;
  readonly sendMessage: (content: string) => void;
  readonly onMessageReceived?: (message: Communication) => void;
  readonly inputDisabled?: boolean;
}

export function BaseChat(props: BaseChatProps): JSX.Element | null {
  const {
    title,
    communications,
    setCommunications,
    query,
    sendMessage,
    onMessageReceived,
    inputDisabled,
    ...paperProps
  } = props;
  const medplum = useMedplum();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState(medplum.getProfile());

  const profileRefStr = useMemo<string>(
    () => (profile ? getReferenceString(medplum.getProfile() as ProfileResource) : ''),
    [profile, medplum]
  );

  useSubscription(`Communication?${query}`, (bundle: Bundle) => {
    const communication = bundle.entry?.[1]?.resource as Communication;
    upsertCommunications(communicationsRef.current, [communication], setCommunications);
    // Call `onMessageReceived` when we are not the sender of a chat message that came in
    if (onMessageReceived && getReferenceString(communication.sender as Reference) !== profileRefStr) {
      onMessageReceived(communication);
    }
  });

  const sendMessageInternal = useCallback(
    (formData: Record<string, string>) => {
      if (inputDisabled) {
        return;
      }
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      sendMessage(formData.message);
      scrollToBottomRef.current = true;
    },
    [inputDisabled, sendMessage]
  );

  // Disabled because we can make sure this will trigger an update when local profile !== medplum.getProfile()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const latestProfile = medplum.getProfile();
    if (profile?.id !== latestProfile?.id) {
      setProfile(latestProfile);
      setCommunications([]);
    }
  });

  const [parentRef, parentRect] = useResizeObserver<HTMLDivElement>();

  const communicationsRef = useRef<Communication[]>(communications);
  communicationsRef.current = communications;
  const prevCommunicationsRef = useRef<Communication[]>(communications);

  const scrollToBottomRef = useRef<boolean>(true);

  const searchMessages = useCallback(async (): Promise<void> => {
    const searchParams = new URLSearchParams(query);
    searchParams.append('_sort', '-sent');
    const searchResult = await medplum.searchResources('Communication', searchParams, { cache: 'no-cache' });
    upsertCommunications(communicationsRef.current, searchResult, setCommunications);
  }, [medplum, setCommunications, query]);

  useEffect(() => {
    searchMessages().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [searchMessages]);

  useEffect(() => {
    if (communications !== prevCommunicationsRef.current) {
      scrollToBottomRef.current = true;
    }
    prevCommunicationsRef.current = communications;
  }, [communications]);

  useEffect(() => {
    if (scrollToBottomRef.current) {
      if (scrollAreaRef.current?.scrollTo) {
        scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
        scrollToBottomRef.current = false;
      }
    }
  });

  const myLastDeliveredId = useMemo<string>(() => {
    let i = communications.length;

    while (i--) {
      const comm = communications[i];
      if (comm.sender?.reference === profileRefStr && comm.received) {
        return comm.id as string;
      }
    }

    return '';
  }, [communications, profileRefStr]);

  if (!profile) {
    return null;
  }

  return (
    <Paper className={classes.chatPaper} p={0} radius="md" {...paperProps}>
      <Title order={2} className={classes.chatTitle}>
        {title}
      </Title>
      <div className={classes.chatBody} ref={parentRef}>
        <ScrollArea viewportRef={scrollAreaRef} className={classes.chatScrollArea} h={parentRect.height}>
          {communications.map((c, i) => {
            const prevCommunication = i > 0 ? communications[i - 1] : undefined;
            const prevCommTime = prevCommunication ? parseSentTime(prevCommunication) : undefined;
            const currCommTime = parseSentTime(c);
            return (
              <Stack key={`${c.id}--${c.meta?.versionId ?? 'no-version'}`} align="stretch">
                {(!prevCommTime || currCommTime !== prevCommTime) && (
                  <div style={{ textAlign: 'center' }}>{currCommTime}</div>
                )}
                {c.sender?.reference === profileRefStr ? (
                  <Group justify="flex-end" align="flex-end" gap="xs" mb="sm">
                    <ChatBubble
                      alignment="right"
                      communication={c}
                      showDelivered={!!c.received && c.id === myLastDeliveredId}
                    />
                    <ResourceAvatar radius="xl" color="orange" value={c.sender} />
                  </Group>
                ) : (
                  <Group justify="flex-start" align="flex-end" gap="xs" mb="sm">
                    <ResourceAvatar radius="xl" value={c.sender} />
                    <ChatBubble alignment="left" communication={c} />
                  </Group>
                )}
              </Stack>
            );
          })}
        </ScrollArea>
      </div>
      <div className={classes.chatInputContainer}>
        <Form onSubmit={sendMessageInternal}>
          <TextInput
            ref={inputRef}
            name="message"
            placeholder={!inputDisabled ? 'Type a message...' : 'Replies are disabled'}
            radius="xl"
            rightSectionWidth={42}
            disabled={inputDisabled}
            rightSection={
              !inputDisabled ? (
                <ActionIcon
                  type="submit"
                  size="1.5rem"
                  radius="xl"
                  color="blue"
                  variant="filled"
                  aria-label="Send message"
                >
                  <IconArrowRight size="1rem" stroke={1.5} />
                </ActionIcon>
              ) : undefined
            }
          />
        </Form>
      </div>
    </Paper>
  );
}

interface ChatBubbleProps {
  readonly communication: Communication;
  readonly alignment: 'left' | 'right';
  readonly showDelivered?: boolean;
}

function ChatBubble(props: ChatBubbleProps): JSX.Element {
  const { communication, alignment, showDelivered } = props;
  const content = communication.payload?.[0]?.contentString || '';
  const seenTime = new Date(communication.received ?? -1);
  const senderResource = useResource(communication.sender);
  return (
    <div className={classes.chatBubbleOuterWrap}>
      <div
        className={cx(classes.chatBubbleName, alignment === 'right' && classes.chatBubbleNameRight)}
        aria-label="Sender name"
      >
        {senderResource ? getDisplayString(senderResource) : '[Unknown sender]'}
      </div>
      <div
        className={
          alignment === 'left' ? classes.chatBubbleLeftAlignedInnerWrap : classes.chatBubbleRightAlignedInnerWrap
        }
      >
        <div className={classes.chatBubble}>{content}</div>
      </div>
      {showDelivered && (
        <div style={{ textAlign: 'right' }}>
          Delivered {seenTime.getHours()}:{seenTime.getMinutes().toString().length === 1 ? '0' : ''}
          {seenTime.getMinutes()}
        </div>
      )}
    </div>
  );
}
