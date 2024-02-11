import { ActionIcon, Avatar, Group, Paper, ScrollArea, Stack, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ProfileResource, createReference, getReferenceString, normalizeErrorString } from '@medplum/core';
import { Bundle, Communication, Practitioner, Reference } from '@medplum/fhirtypes';
import { DrAliceSmith } from '@medplum/mock';
import { Form, useMedplum, useSubscription } from '@medplum/react';
import { IconArrowRight, IconChevronDown, IconMessage } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classes from './Chat.module.css';

const DR_ALICE_SMITH: Reference<Practitioner> = {
  reference: getReferenceString(DrAliceSmith),
  display: 'Dr. Alice Smith',
};

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

export function Chat(): JSX.Element | null {
  const medplum = useMedplum();
  const [open, setOpen] = useState(false);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState(medplum.getProfile());

  const profileRefStr = useMemo<string>(
    () => (profile ? getReferenceString(medplum.getProfile() as ProfileResource) : ''),
    [profile, medplum]
  );

  useSubscription(
    `Communication?sender=${profileRefStr},${DR_ALICE_SMITH.reference}&recipient=${DR_ALICE_SMITH.reference},${profileRefStr}`,
    (bundle: Bundle) => {
      const communication = bundle.entry?.[1]?.resource as Communication;
      upsertCommunications(communicationsRef.current, [communication], setCommunications);
      if (!(communication.received && communication.status === 'completed')) {
        medplum
          .updateResource<Communication>({
            ...communication,
            received: communication.received ?? new Date().toISOString(), // Mark as received if needed
            status: 'completed', // Mark as read
            // See: https://www.medplum.com/docs/communications/organizing-communications#:~:text=THE%20Communication%20LIFECYCLE
            // for more info about recommended `Communication` lifecycle
          })
          .catch(console.error);
      }
    }
  );

  // Disabled because we can make sure this will trigger an update when local profile !== medplum.getProfile()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const latestProfile = medplum.getProfile();
    if (profile?.id !== latestProfile?.id) {
      setProfile(latestProfile);
    }
  });

  const communicationsRef = useRef<Communication[]>(communications);
  communicationsRef.current = communications;
  const prevCommunicationsRef = useRef<Communication[]>(communications);

  const scrollToBottomRef = useRef<boolean>(false);

  const searchMessages = useCallback(async (): Promise<void> => {
    const searchResult = await medplum.searchResources(
      'Communication',
      {
        _sort: '-_lastUpdated',
        sender: `${profileRefStr},${DR_ALICE_SMITH.reference}`,
        recipient: `${profileRefStr},${DR_ALICE_SMITH.reference}`,
      },
      { cache: 'no-cache' }
    );
    upsertCommunications(communicationsRef.current, searchResult, setCommunications);
  }, [medplum, profileRefStr]);

  const sendMessage = useCallback(
    async (formData: Record<string, string>) => {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      const message = formData.message;
      const communication = await medplum.createResource<Communication>({
        resourceType: 'Communication',
        status: 'in-progress',
        // subject: createReference(resource),
        sender: createReference(profile as ProfileResource),
        recipient: [DR_ALICE_SMITH],
        sent: new Date().toISOString(),
        payload: [{ contentString: message }],
      });
      setCommunications([...communications, communication]);
      scrollToBottomRef.current = true;
    },
    [medplum, profile, communications]
  );

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
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
      }
      scrollToBottomRef.current = false;
    }
  });

  const myLastCommunicationId = useMemo<string>(() => {
    let i = communications.length;

    while (i--) {
      const comm = communications[i];
      if (comm.sender?.reference === profileRefStr) {
        return comm.id as string;
      }
    }

    return '';
  }, [communications, profileRefStr]);

  if (!profile) {
    return null;
  }

  if (open) {
    return (
      <>
        <div className={classes.chatContainer}>
          <Paper className={classes.chatPaper} shadow="xl" p={0} radius="md" withBorder>
            <div className={classes.chatTitle}>Chat with {DR_ALICE_SMITH.display}</div>
            <div className={classes.chatBody}>
              <ScrollArea viewportRef={scrollAreaRef} className={classes.chatScrollArea} w={400} h={360}>
                {communications.map((c, i) => {
                  const prevCommunication = i > 0 ? communications[i - 1] : undefined;
                  const prevCommTime = prevCommunication ? parseSentTime(prevCommunication) : undefined;
                  const currCommTime = parseSentTime(c);
                  return (
                    <Stack key={`${c.id}--${c.meta?.versionId ?? 'no-version'}`} align="stretch">
                      {!prevCommTime ||
                        (currCommTime !== prevCommTime && <div style={{ textAlign: 'center' }}>{currCommTime}</div>)}
                      {c.sender?.reference === profileRefStr ? (
                        <Group justify="flex-end" gap="xs" mb="sm">
                          <ChatBubble
                            communication={c}
                            showDelivered={!!c.received && c.id === myLastCommunicationId}
                          />
                          <Avatar radius="xl" color="orange" />
                        </Group>
                      ) : (
                        <Group align="flex-start" gap="xs" mb="sm">
                          <Avatar radius="xl" color="teal" />
                          <ChatBubble communication={c} />
                        </Group>
                      )}
                    </Stack>
                  );
                })}
              </ScrollArea>
            </div>
            <div className={classes.chatInputContainer}>
              <Form onSubmit={sendMessage}>
                <TextInput
                  ref={inputRef}
                  name="message"
                  placeholder="Type a message..."
                  radius="xl"
                  rightSectionWidth={42}
                  rightSection={
                    <ActionIcon type="submit" size="1.5rem" radius="xl" color="blue" variant="filled">
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
            onClick={() => setOpen(false)}
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
          setOpen(true);
          scrollToBottomRef.current = true;
        }}
      >
        <IconMessage size="1.625rem" />
      </ActionIcon>
    </div>
  );
}

interface ChatBubbleProps {
  communication: Communication;
  showDelivered?: boolean;
}

function ChatBubble(props: ChatBubbleProps): JSX.Element {
  const content = props.communication.payload?.[0]?.contentString || '';
  const seenTime = new Date(props.communication.received ?? -1);
  return (
    <div className={classes.chatBubbleWrap}>
      <div className={classes.chatBubble}>{content}</div>
      {props.showDelivered && (
        <div style={{ textAlign: 'right' }}>
          Delivered {seenTime.getHours()}:{seenTime.getMinutes().toString().length === 1 ? '0' : ''}
          {seenTime.getMinutes()}
        </div>
      )}
    </div>
  );
}
