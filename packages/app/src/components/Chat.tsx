import { ActionIcon, Avatar, createStyles, Group, Paper, ScrollArea, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getReferenceString, normalizeErrorString, ProfileResource } from '@medplum/core';
import { Communication, Practitioner, Reference } from '@medplum/fhirtypes';
import { Form, MedplumLink, useMedplum } from '@medplum/react';
import { IconArrowRight, IconChevronDown, IconMessage } from '@tabler/icons-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

const CHAT_GPT: Reference<Practitioner> = {
  reference: 'Practitioner/cc358e24-aadd-4a3c-9d9d-99fb06904d26',
  display: 'Chat GPT',
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

export function Chat(): JSX.Element | null {
  const medplum = useMedplum();
  const { classes } = useStyles();
  const [open, setOpen] = useState(false);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const communicationsRef = useRef<Communication[]>();
  communicationsRef.current = communications;

  const openRef = useRef<boolean>();
  openRef.current = open;

  const scrollToBottom = useRef<boolean>(false);

  async function searchMessages(): Promise<void> {
    const profile = medplum.getProfile() as ProfileResource;
    const profileRefStr = profile && getReferenceString(profile);
    const searchResult = await medplum.searchResources(
      'Communication',
      {
        _sort: '-_lastUpdated',
        status: 'completed',
        sender: `${profileRefStr},${CHAT_GPT.reference}`,
        recipient: `${profileRefStr},${CHAT_GPT.reference}`,
      },
      { cache: 'no-cache' }
    );
    const newCommunications = [...(communicationsRef.current as Communication[])];
    let foundNew = false;
    for (const searchEntry of searchResult) {
      if (!newCommunications.some((c) => c.id === searchEntry.id)) {
        newCommunications.push(searchEntry as Communication);
        foundNew = true;
      }
    }

    if (foundNew) {
      newCommunications.sort((a, b) => (a.meta?.lastUpdated as string).localeCompare(b.meta?.lastUpdated as string));
      setCommunications(newCommunications);
      scrollToBottom.current = true;
    }
  }

  const sendMessage = useCallback(
    async (formData: Record<string, string>) => {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      const profile = medplum.getProfile() as ProfileResource;
      const message = formData.message;
      const communication = await medplum.createResource<Communication>({
        resourceType: 'Communication',
        status: 'completed',
        // subject: createReference(resource),
        sender: createReference(profile),
        recipient: [CHAT_GPT],
        sent: new Date().toISOString(),
        payload: [{ contentString: message }],
      });
      setCommunications([...communications, communication]);
      scrollToBottom.current = true;
    },
    [medplum, communications, setCommunications]
  );

  useEffect(() => {
    searchMessages().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    const timer = setInterval(() => {
      if (!document.hidden && openRef.current) {
        searchMessages().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [medplum]);

  useEffect(() => {
    if (scrollToBottom.current) {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
      }
      scrollToBottom.current = false;
    }
  }, undefined);

  if (!medplum.getProfile()) {
    return null;
  }

  if (open) {
    return (
      <>
        <div className={classes.chatContainer}>
          <Paper className={classes.chatPaper} shadow="xl" p={0} radius="md" withBorder>
            <div className={classes.chatTitle}>Chat with GPT</div>
            <div className={classes.chatBody}>
              <ScrollArea viewportRef={scrollAreaRef} className={classes.chatScrollArea} w={400} h={360}>
                {communications.map((c) =>
                  c.sender?.reference === getReferenceString(medplum.getProfile() as ProfileResource) ? (
                    <Group key={c.id} position="right" align="flex-start" spacing="xs" mb="sm" noWrap>
                      <ChatBubble communication={c} />
                      <Avatar radius="xl" color="orange" />
                    </Group>
                  ) : (
                    <Group key={c.id} align="flex-start" spacing="xs" mb="sm" noWrap>
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
          scrollToBottom.current = true;
        }}
      >
        <IconMessage size="1.625rem" />
      </ActionIcon>
    </div>
  );
}

interface ChatBubbleProps {
  communication: Communication;
}

function ChatBubble(props: ChatBubbleProps): JSX.Element {
  const { classes } = useStyles();
  let markdown = props.communication.payload?.[0]?.contentString || '';

  // Wrap FHIR URL's in the format of "[baseurl]/[resource]/[id]" with markdown link
  // markdown = markdown.replace(/\[baseurl](/[^\s]+)/g, '[$1]($1)');
  markdown = markdown.replace(/`*\[(base|baseurl)\](\/[^\s`]+)`*/g, '[$2]($2)');

  return (
    <div className={classes.chatBubble}>
      <ReactMarkdown
        components={{
          a: ({ node, href, children }) => <MedplumLink to={href}>{children}</MedplumLink>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
