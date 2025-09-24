// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Group,
  LoadingOverlay,
  Paper,
  PaperProps,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useResizeObserver } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { ProfileResource, WithId, getDisplayString, getReferenceString, normalizeErrorString } from '@medplum/core';
import { Bundle, Communication, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource, useSubscription } from '@medplum/react-hooks';
import { IconArrowRight } from '@tabler/icons-react';
import { JSX, LegacyRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form } from '../../Form/Form';
import { ResourceAvatar } from '../../ResourceAvatar/ResourceAvatar';
import classes from './BaseChat.module.css';

function showError(message: string): void {
  showNotification({
    color: 'red',
    title: 'Error',
    message,
    autoClose: false,
  });
}

function parseSentTime(communication: Communication): string {
  return new Date(communication.sent ?? 0).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
    newCommunications.sort((a, b) => {
      if (!a.sent && !b.sent) {
        return 0;
      }
      if (!a.sent) {
        return -1;
      }
      if (!b.sent) {
        return 1;
      }
      return (a.sent as string).localeCompare(b.sent as string);
    });
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
  readonly onMessageUpdated?: (message: Communication) => void;
  readonly inputDisabled?: boolean;
  readonly excludeHeader?: boolean;
  readonly onError?: (err: Error) => void;
}

/**
 * BaseChat component for displaying and managing communications.
 *
 * **NOTE: The component automatically filters `Communication` resources where the `sent` property is `undefined`.**
 *
 * @param props - The BaseChat React props.
 * @returns The BaseChat React node.
 */
export function BaseChat(props: BaseChatProps): JSX.Element | null {
  const {
    title,
    communications,
    setCommunications,
    query,
    sendMessage,
    onMessageReceived,
    onMessageUpdated,
    inputDisabled,
    onError,
    excludeHeader = false,
    ...paperProps
  } = props;
  const medplum = useMedplum();

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const firstScrollRef = useRef(true);
  const initialLoadRef = useRef(true);

  const [profile, setProfile] = useState(medplum.getProfile());
  const [reconnecting, setReconnecting] = useState(false);
  const [loading, setLoading] = useState(true);

  if (!loading) {
    initialLoadRef.current = false;
  }

  const profileRefStr = useMemo<string>(
    () => (profile ? getReferenceString(medplum.getProfile() as WithId<ProfileResource>) : ''),
    [profile, medplum]
  );

  const searchMessages = useCallback(async (): Promise<void> => {
    setLoading(true);
    const searchParams = new URLSearchParams(query);
    searchParams.append('_sort', '-sent');
    searchParams.append('sent:missing', 'false');
    const searchResult = await medplum.searchResources('Communication', searchParams, { cache: 'no-cache' });
    upsertCommunications(communicationsRef.current, searchResult, setCommunications);
    setLoading(false);
  }, [medplum, setCommunications, query]);

  useEffect(() => {
    searchMessages().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [searchMessages]);

  useSubscription(
    `Communication?${query}`,
    (bundle: Bundle) => {
      const communication = bundle.entry?.[1]?.resource as Communication;
      upsertCommunications(communicationsRef.current, [communication], setCommunications);
      // If we are the sender of this message, then we want to skip calling `onMessageUpdated` or `onMessageReceived`
      if (getReferenceString(communication.sender as Reference) === profileRefStr) {
        return;
      }
      // If this communication already exists, call `onMessageUpdated`
      if (communicationsRef.current.find((c) => c.id === communication.id)) {
        onMessageUpdated?.(communication);
      } else {
        // Else a new message was created
        // Call `onMessageReceived` when we are not the sender of a chat message that came in
        onMessageReceived?.(communication);
      }
    },
    {
      onWebSocketClose: useCallback(() => {
        if (!reconnecting) {
          setReconnecting(true);
        }
        showNotification({ color: 'red', message: 'Live chat disconnected. Attempting to reconnect...' });
      }, [reconnecting]),
      onWebSocketOpen: useCallback(() => {
        if (reconnecting) {
          showNotification({ color: 'green', message: 'Live chat reconnected.' });
        }
      }, [reconnecting]),
      onSubscriptionConnect: useCallback(() => {
        if (reconnecting) {
          searchMessages().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
          setReconnecting(false);
        }
      }, [reconnecting, searchMessages]),
      onError: useCallback(
        (err: Error) => {
          if (onError) {
            onError(err);
          } else {
            showError(normalizeErrorString(err));
          }
        },
        [onError]
      ),
    }
  );

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

  useEffect(() => {
    if (communications !== prevCommunicationsRef.current) {
      scrollToBottomRef.current = true;
    }
    prevCommunicationsRef.current = communications;
  }, [communications]);

  useEffect(() => {
    if (scrollToBottomRef.current) {
      if (scrollAreaRef.current?.scrollTo) {
        scrollAreaRef.current.scrollTo({
          top: scrollAreaRef.current.scrollHeight,
          // We want to skip scrolling through the whole chat on initial load,
          // Then every time after we will do the "smooth scroll"
          ...(firstScrollRef.current ? { duration: 0 } : { behavior: 'smooth' }),
        });
        firstScrollRef.current = false;
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
      {!excludeHeader && (
        <Title order={2} className={classes.chatTitle}>
          {title}
        </Title>
      )}
      <div className={classes.chatBody} ref={parentRef as LegacyRef<HTMLDivElement>}>
        {initialLoadRef.current ? (
          <Stack key="skeleton-chat-messages" align="stretch" mt="lg">
            <Group justify="flex-start" align="flex-end" gap="xs" mb="sm">
              <Skeleton height={38} circle ml="md" />
              <ChatBubbleSkeleton alignment="left" parentWidth={parentRect.width} />
            </Group>
            <Group justify="flex-end" align="flex-end" gap="xs" mb="sm">
              <ChatBubbleSkeleton alignment="right" parentWidth={parentRect.width} />
              <Skeleton height={38} circle mr="md" />
            </Group>
            <Group justify="flex-start" align="flex-end" gap="xs" mb="sm">
              <Skeleton height={38} circle ml="md" />
              <ChatBubbleSkeleton alignment="left" parentWidth={parentRect.width} />
            </Group>
          </Stack>
        ) : (
          <ScrollArea viewportRef={scrollAreaRef} className={classes.chatScrollArea} h={parentRect.height}>
            {/* We don't wrap our scrollarea or scrollarea children with this overlay since it seems to break the rendering of the virtual scroll element */}
            {/* Instead we manually set the width and height to match the parent and use absolute positioning */}
            <LoadingOverlay
              visible={loading || reconnecting}
              style={{ width: parentRect.width, height: parentRect.height, position: 'absolute', zIndex: 1 }}
            />
            {communications.map((c, i) => {
              const prevCommunication = i > 0 ? communications[i - 1] : undefined;
              const prevCommTime = prevCommunication ? parseSentTime(prevCommunication) : undefined;
              const currCommTime = parseSentTime(c);
              const showDelivered = !!c.received && c.id === myLastDeliveredId;
              return (
                <Stack key={`${c.id}--${c.meta?.versionId ?? 'no-version'}`} align="stretch">
                  {(!prevCommTime || currCommTime !== prevCommTime) && (
                    <Text fz="xs" ta="center">
                      {currCommTime}
                    </Text>
                  )}
                  {c.sender?.reference === profileRefStr ? (
                    <Group justify="flex-end" align="flex-end" gap="xs" mb="sm">
                      <ChatBubble alignment="right" communication={c} showDelivered={showDelivered} />
                      <ResourceAvatar
                        radius="xl"
                        color="orange"
                        value={c.sender}
                        mb={!showDelivered ? 'sm' : undefined}
                      />
                    </Group>
                  ) : (
                    <Group justify="flex-start" align="flex-end" gap="xs" mb="sm">
                      <ResourceAvatar radius="xl" value={c.sender} mb="sm" />
                      <ChatBubble alignment="left" communication={c} />
                    </Group>
                  )}
                </Stack>
              );
            })}
          </ScrollArea>
        )}
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
  const sentTime = new Date(communication.sent ?? -1);
  const seenTime = new Date(communication.received ?? -1);
  const senderResource = useResource(communication.sender);
  return (
    <div className={classes.chatBubbleOuterWrap}>
      <Text
        fz="xs"
        mb="xs"
        fw={500}
        className={alignment === 'right' ? classes.chatBubbleNameRight : undefined}
        aria-label="Sender name"
      >
        {senderResource ? getDisplayString(senderResource) : '[Unknown sender]'}
        &nbsp;&middot;&nbsp;
        <Text span c="dimmed" fz="xs">
          {isNaN(sentTime.getTime()) ? '' : sentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </Text>
      </Text>
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

export interface ChatBubbleSkeletonProps {
  readonly alignment: 'left' | 'right';
  readonly parentWidth: number;
}

function ChatBubbleSkeleton(props: ChatBubbleSkeletonProps): JSX.Element {
  const { alignment, parentWidth } = props;
  return (
    <div className={classes.chatBubbleOuterWrap}>
      <div className={classes.chatBubbleName} aria-label="Placeholder sender name">
        <div style={{ position: 'relative' }}>
          <Skeleton
            height={14}
            width="100px"
            radius="l"
            ml={alignment === 'left' ? 'sm' : undefined}
            style={alignment === 'right' ? { position: 'absolute', right: 5, top: -15 } : undefined}
          />
        </div>
      </div>
      <div
        className={
          alignment === 'left' ? classes.chatBubbleLeftAlignedInnerWrap : classes.chatBubbleRightAlignedInnerWrap
        }
      >
        <div className={classes.chatBubble}>
          <Skeleton height={14} width={parentWidth * 0.5} radius="l" />
        </div>
      </div>
    </div>
  );
}
