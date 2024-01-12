import { ActionIcon, Avatar, createStyles, Group, Paper, ScrollArea, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  createReference,
  getReferenceString,
  MedplumClient,
  normalizeErrorString,
  ProfileResource,
} from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  Communication,
  Parameters,
  Practitioner,
  Reference,
  Subscription,
} from '@medplum/fhirtypes';
import { DrAliceSmith } from '@medplum/mock';
import { Form, useMedplum } from '@medplum/react';
import { IconArrowRight, IconChevronDown, IconMessage } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DR_ALICE_SMITH: Reference<Practitioner> = {
  reference: getReferenceString(DrAliceSmith),
  display: 'Dr. Alice Smith',
};

const useStyles = createStyles((theme) => ({
  iconContainer: {
    position: 'fixed',
    bottom: '0.5rem',
    right: '0.5rem',
    zIndex: 100,
  },

  icon: {
    backgroundColor: 'white',
    boxShadow: '0 0.2rem 0.4rem rgba(0, 0, 0, 0.05), 0 0.2rem 0.4rem rgba(0, 0, 0, 0.1)',
  },

  chatContainer: {
    position: 'fixed',
    bottom: '3rem',
    right: '0.5rem',
    zIndex: 100,
    width: '400px',
    height: '450px',
    maxHeight: '450px',
    overflow: 'hidden',
    borderRadius: theme.radius.md,
    boxShadow: '0 0.2rem 0.4rem rgba(0, 0, 0, 0.05), 0 0.2rem 0.4rem rgba(0, 0, 0, 0.1)',
  },

  chatPaper: {
    width: '400px',
    height: '450px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },

  chatTitle: {
    backgroundColor: theme.colors.blue[7],
    borderRadius: `${theme.radius.md} ${theme.radius.md} 0 0`,
    color: theme.white,
    fontSize: theme.fontSizes.sm,
    fontWeight: 500,
    padding: theme.spacing.sm,
    userSelect: 'none',
  },

  chatBody: {
    backgroundColor: theme.white,
    flex: 1,
    height: '360px',
    maxHeight: '360px',
  },

  chatScrollArea: {
    padding: theme.spacing.xs,
  },

  chatInputContainer: {
    backgroundColor: theme.colors.gray[0],
    borderRadius: `0 0 ${theme.radius.md} ${theme.radius.md}`,
    padding: '4px 4px',
  },

  chatBubble: {
    backgroundColor: theme.colors.gray[0],
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    maxWidth: '300px',

    '& p': {
      marginTop: '0.25rem',
      marginBottom: '0.25rem',
    },

    '& pre': {
      maxWidth: '280px',
      overflow: 'auto',
    },
  },
}));

function parseSentTime(communication: Communication): string {
  const sentTime = new Date(communication.sent ?? 0);
  const sentTimeMins = sentTime.getMinutes().toString();
  return `${sentTime.getHours()}:${sentTimeMins.length === 1 ? '0' : ''}${sentTimeMins}`;
}

function upsertCommunications(
  communications: Communication[],
  received: Communication[],
  setCommunications: (communications: Communication[]) => void,
  onNewCommunications: () => void
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
    setCommunications(newCommunications);
    onNewCommunications();
  }
}

async function listenForSub(
  medplum: MedplumClient,
  subscription: Subscription,
  setWebSocket: (ws: WebSocket) => void,
  onNewMessage: (c: Communication) => void
): Promise<void> {
  const { parameter } = (await medplum.get(
    `/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`
  )) as Parameters;
  const token = parameter?.find((param) => param.name === 'token')?.valueString;
  const url = parameter?.find((param) => param.name === 'websocket-url')?.valueUrl;
  if (!token) {
    throw new Error('Failed to get token!');
  }

  if (!url) {
    throw new Error('Failed to get URL from $get-ws-binding-token!');
  }

  const ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
  });

  ws.addEventListener('message', (event: MessageEvent<string>) => {
    const bundle = JSON.parse(event.data) as Bundle;
    for (const entry of bundle.entry as BundleEntry[]) {
      const entryResource = entry?.resource;
      if (
        entryResource?.resourceType === 'Communication' &&
        !(entryResource.received && entryResource.status === 'completed')
      ) {
        medplum
          .updateResource<Communication>({
            ...entryResource,
            received: new Date().toISOString(), // Mark as received
            status: 'completed', // Mark as read
            // See: https://www.medplum.com/docs/communications/organizing-communications#:~:text=THE%20Communication%20LIFECYCLE
            // for more info about recommended `Communication` lifecycle
          })
          .catch(console.error);
      }
    }
    const communication = bundle.entry?.[1]?.resource;
    if (!communication || communication.resourceType !== 'Communication') {
      console.error('Invalid chat bundle!');
      return;
    }
    onNewMessage(communication);
  });

  setWebSocket(ws);
}

export function Chat(): JSX.Element | null {
  const medplum = useMedplum();
  const { classes } = useStyles();
  const [open, setOpen] = useState(false);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState(medplum.getProfile());
  const [subscription, setSubscription] = useState<Subscription | undefined>(undefined);
  const [webSocket, setWebSocket] = useState<WebSocket | undefined>();

  const creatingSubRef = useRef(false);
  const deleteSubTimerRef = useRef<NodeJS.Timeout | undefined>();

  const profileRefStr = useMemo<string>(
    () => (profile ? getReferenceString(medplum.getProfile() as ProfileResource) : ''),
    [profile, medplum]
  );

  // Disabled because we can make sure this will trigger an update when local profile !== medplum.getProfile()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const latestProfile = medplum.getProfile();
    if (profile !== latestProfile) {
      setProfile(latestProfile);
    }
  });

  const communicationsRef = useRef<Communication[]>(communications);
  communicationsRef.current = communications;

  const openRef = useRef<boolean>();
  openRef.current = open;

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
    upsertCommunications(communicationsRef.current, searchResult, setCommunications, () => {
      scrollToBottomRef.current = true;
    });
  }, [medplum, profileRefStr]);

  useEffect(() => {
    // Create subscription...
    // Check for creatingSubRef
    if (!profileRefStr || creatingSubRef.current) {
      return () => undefined;
    }
    if (!subscription) {
      creatingSubRef.current = true;
      medplum
        .createResource<Subscription>({
          resourceType: 'Subscription',
          criteria: `Communication?sender=${profileRefStr},${DR_ALICE_SMITH.reference}&recipient=${DR_ALICE_SMITH.reference},${profileRefStr}`,
          status: 'active',
          reason: `Watch for Communications between ${profileRefStr} and ${DR_ALICE_SMITH.reference}.`,
          channel: {
            type: 'websocket',
          },
        })
        .then((subscription) => {
          setSubscription(subscription);
          listenForSub(medplum, subscription, setWebSocket, (communication) => {
            upsertCommunications(communicationsRef.current, [communication], setCommunications, () => {
              scrollToBottomRef.current = true;
            });
          })
            .then(() => {
              creatingSubRef.current = false;
            })
            .catch(console.error);
        })
        .catch(console.error);
    }
    if (deleteSubTimerRef.current) {
      clearTimeout(deleteSubTimerRef.current);
      deleteSubTimerRef.current = undefined;
    }
    return () => {
      if (deleteSubTimerRef.current) {
        return;
      }
      deleteSubTimerRef.current = setTimeout(() => {}, 1000);
    };
  }, [medplum, profileRefStr, subscription]);

  const sendMessage = useCallback(
    async (formData: Record<string, string>) => {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      const message = formData.message;
      const communication = await medplum.createResource<Communication>({
        resourceType: 'Communication',
        status: 'completed',
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

  if (open && webSocket) {
    return (
      <>
        <div className={classes.chatContainer}>
          <Paper className={classes.chatPaper} shadow="xl" p={0} radius="md" withBorder>
            <div className={classes.chatTitle}>Chat with Dr. John Miller</div>
            <div className={classes.chatBody}>
              <ScrollArea viewportRef={scrollAreaRef} className={classes.chatScrollArea} w={400} h={360}>
                {communications.map((c) =>
                  c.sender?.reference === profileRefStr ? (
                    <Group key={c.id} position="apart" noWrap>
                      <div>{parseSentTime(c)}</div>
                      <Group position="right" align="flex-start" spacing="xs" mb="sm" noWrap>
                        <ChatBubble communication={c} showSeen={c.id === myLastCommunicationId} />
                        <Avatar radius="xl" color="orange" />
                      </Group>
                    </Group>
                  ) : (
                    <Group key={c.id} align="flex-start" spacing="xs" mb="sm" noWrap>
                      <div>{parseSentTime(c)}</div>
                      <Avatar radius="xl" color="teal" />
                      <ChatBubble communication={c} />
                    </Group>
                  )
                )}
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
                    <ActionIcon size="1.5rem" radius="xl" color="blue" variant="filled">
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
  showSeen?: boolean;
}

function ChatBubble(props: ChatBubbleProps): JSX.Element {
  const { classes } = useStyles();
  const content = props.communication.payload?.[0]?.contentString || '';
  const seenTime = new Date(props.communication.received ?? -1);
  return (
    <div>
      <div className={classes.chatBubble}>{content}</div>
      {props.showSeen && (
        <div style={{ textAlign: 'right' }}>
          Seen {seenTime.getHours()}:{seenTime.getMinutes().toString().length === 1 ? '0' : ''}
          {seenTime.getMinutes()}
        </div>
      )}
    </div>
  );
}
