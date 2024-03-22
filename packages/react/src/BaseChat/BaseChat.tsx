import { ActionIcon, Avatar, Group, Paper, ScrollArea, Stack, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ProfileResource, getReferenceString, normalizeErrorString } from '@medplum/core';
import { Bundle, Communication, Reference } from '@medplum/fhirtypes';
import { useMedplum, useSubscription } from '@medplum/react-hooks';
import { IconArrowRight, IconChevronDown, IconMessage } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form } from '../Form/Form';
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

export interface BaseChatProps {
  readonly title: string;
  readonly communications: Communication[];
  readonly setCommunications: (communications: Communication[]) => void;
  readonly query: string;
  readonly sendMessage: (content: string) => void;
  readonly onMessageReceived?: (message: Communication) => void;
  readonly open?: boolean;
}

export function BaseChat(props: BaseChatProps): JSX.Element | null {
  const { title, communications, setCommunications, query, sendMessage, open, onMessageReceived } = props;
  const medplum = useMedplum();
  const [opened, setOpened] = useState(open ?? false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState(medplum.getProfile());

  const profileRefStr = useMemo<string>(
    () => (profile ? getReferenceString(medplum.getProfile() as ProfileResource) : ''),
    [profile, medplum]
  );

  useEffect(() => {
    setOpened((prevVal) => open ?? prevVal);
  }, [open]);

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
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      sendMessage(formData.message);
      scrollToBottomRef.current = true;
    },
    [sendMessage]
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

  if (opened) {
    return (
      <>
        <div className={classes.chatContainer}>
          <Paper className={classes.chatPaper} shadow="xl" p={0} radius="md" withBorder>
            <Title order={2} className={classes.chatTitle}>
              {title}
            </Title>
            <div className={classes.chatBody}>
              <ScrollArea viewportRef={scrollAreaRef} className={classes.chatScrollArea} w={400} h={360}>
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
                        <Group justify="flex-end" gap="xs" mb="sm">
                          <ChatBubble
                            alignment="right"
                            communication={c}
                            showDelivered={!!c.received && c.id === myLastDeliveredId}
                          />
                          <Avatar radius="xl" color="orange" />
                        </Group>
                      ) : (
                        <Group align="flex-start" gap="xs" mb="sm">
                          <Avatar radius="xl" color="teal" />
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
                  placeholder="Type a message..."
                  radius="xl"
                  rightSectionWidth={42}
                  rightSection={
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
                  }
                />
              </Form>
            </div>
          </Paper>
        </div>
        <div className={classes.iconContainer}>
          <ActionIcon
            className={classes.icon}
            color="blue"
            size="lg"
            radius="xl"
            variant="outline"
            onClick={() => setOpened(false)}
            aria-label="Close chat"
          >
            <IconChevronDown size="1.625rem" />
          </ActionIcon>
        </div>
      </>
    );
  }

  return (
    <div className={classes.iconContainer}>
      <ActionIcon
        className={classes.icon}
        color="blue"
        size="lg"
        radius="xl"
        variant="outline"
        onClick={() => {
          setOpened(true);
          scrollToBottomRef.current = true;
        }}
        aria-label="Open chat"
      >
        <IconMessage size="1.625rem" />
      </ActionIcon>
    </div>
  );
}

interface ChatBubbleProps {
  readonly communication: Communication;
  readonly alignment: 'left' | 'right';
  readonly showDelivered?: boolean;
}

function ChatBubble(props: ChatBubbleProps): JSX.Element {
  const content = props.communication.payload?.[0]?.contentString || '';
  const seenTime = new Date(props.communication.received ?? -1);
  return (
    <div className={classes.chatBubbleOuterWrap}>
      <div
        className={
          props.alignment === 'left' ? classes.chatBubbleLeftAlignedInnerWrap : classes.chatBubbleRightAlignedInnerWrap
        }
      >
        <div className={classes.chatBubble}>{content}</div>
      </div>
      {props.showDelivered && (
        <div style={{ textAlign: 'right' }}>
          Delivered {seenTime.getHours()}:{seenTime.getMinutes().toString().length === 1 ? '0' : ''}
          {seenTime.getMinutes()}
        </div>
      )}
    </div>
  );
}
