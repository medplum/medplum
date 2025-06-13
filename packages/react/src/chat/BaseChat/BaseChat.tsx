import {
  ActionIcon,
  Group,
  Paper,
  PaperProps,
  ScrollArea,
  Stack,
  Textarea,
} from '@mantine/core';
import { useResizeObserver } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { ProfileResource, WithId, createReference, getDisplayString, getReferenceString, normalizeErrorString } from '@medplum/core';
import { Bundle, Communication, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource, useSubscription } from '@medplum/react-hooks';
import { IconArrowRight } from '@tabler/icons-react';
import { JSX, LegacyRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Form } from '../../Form/Form';
import { ResourceAvatar } from '../../ResourceAvatar/ResourceAvatar';
import classes from './BaseChat.module.css';

// Map to store draft text by thread ID
const draftTextMap = new Map<string, string>();

function showError(message: string): void {
  showNotification({
    color: 'red',
    title: 'Error',
    message,
    autoClose: false,
  });
}

function formatCenteredTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayOfWeek = days[date.getDay()];
  const month = months[date.getMonth()];
  const day = date.getDate();
  return `${dayOfWeek}, ${month} ${day}`;
}

function formatBubbleTime(dateString: string): string {
  const date = new Date(dateString);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) { hours = 12; }
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minutesStr} ${ampm}`;
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
    const getSentString = (comm: any): string => typeof comm.sent === 'string' ? comm.sent : '';
    newCommunications.sort((a, b) => {
      const aSent = getSentString(a);
      const bSent = getSentString(b);
      if (!aSent && !bSent) { return 0; }
      if (!aSent) { return 1; }
      if (!bSent) { return -1; }
      return aSent.localeCompare(bSent);
    });
  }

  setCommunications(newCommunications);
}

export interface BaseChatProps extends PaperProps {
  readonly communications: Communication[];
  readonly setCommunications?: (communications: Communication[]) => void;
  readonly query: string;
  readonly onMessageReceived?: (message: Communication) => void;
  readonly onMessageUpdated?: (message: Communication) => void;
  readonly inputDisabled?: boolean;
  readonly onError?: (err: Error) => void;
  readonly rightAlignReference?: string;
  readonly recipientName?: string;
  readonly subject: Reference<Patient>;
  readonly sendMessage: (formData: Record<string, string>) => void;
}

// Helper to get a date key for grouping (YYYY-MM-DD)
function getDateKey(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// Helper to get patient display name, fetching resource if needed
async function getPatientDisplay(subject: Reference<Patient> | Patient, medplum: any): Promise<string> {
  if ('name' in subject && subject.name) {
    return getDisplayString(subject);
  } else if ('reference' in subject && subject.reference) {
    const patientId = subject.reference.split('/')[1];
    const patient = await medplum.readResource('Patient', patientId);
    return getDisplayString(patient);
  }
  return '';
}

// Helper to get reference string from Patient or Reference<Patient>
function getPatientReference(subject: Reference<Patient> | Patient): string {
  if ('reference' in subject && subject.reference) {
    return subject.reference;
  } else if ('id' in subject && subject.id) {
    return `Patient/${subject.id}`;
  }
  return '';
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
    communications,
    setCommunications,
    query,
    onMessageReceived,
    onMessageUpdated,
    inputDisabled,
    onError,
    rightAlignReference,
    recipientName,
    subject,
    sendMessage: _sendMessage,
    ...paperProps
  } = props;
  const medplum = useMedplum();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prevQueryRef = useRef(query);
  const prevCommsLengthRef = useRef(communications.length);

  const [profile, setProfile] = useState(medplum.getProfile());
  const [reconnecting, setReconnecting] = useState(false);
  const [_loading, setLoading] = useState(true);
  const [hasInitialScroll, setHasInitialScroll] = useState(false);

  // Handle initial scroll and thread changes
  useEffect(() => {
    if (!scrollAreaRef.current || hasInitialScroll) {
      return;
    }

    // Set scroll position without animation
    scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    setHasInitialScroll(true);
    prevCommsLengthRef.current = communications.length;
  }, [hasInitialScroll, communications]);

  // Handle new message animations
  useLayoutEffect(() => {
    if (!scrollAreaRef.current || !hasInitialScroll) {
      return;
    }

    // Use RAF to ensure we run after the DOM update
    requestAnimationFrame(() => {
      if (!scrollAreaRef.current) {
        return;
      }

      // Add smooth scroll class
      scrollAreaRef.current.classList.add(classes.smoothScroll);
      
      // Scroll to bottom
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;

      // Remove smooth scroll class after animation
      setTimeout(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.classList.remove(classes.smoothScroll);
        }
      }, 300);
    });

    prevCommsLengthRef.current = communications.length;
  }, [communications.length, hasInitialScroll]);

  // Handle draft text persistence when switching threads
  useEffect(() => {
    if (query !== prevQueryRef.current && inputRef.current) {
      // Save current draft text before switching threads
      if (prevQueryRef.current) {
        draftTextMap.set(prevQueryRef.current, inputRef.current.value);
      }
      // Restore draft text for the new thread
      inputRef.current.value = draftTextMap.get(query) || '';
    }
    prevQueryRef.current = query;
  }, [query]);

  // Reset scroll state when component unmounts
  useEffect(() => {
    return () => {
      setHasInitialScroll(false);
    };
  }, []);

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
    if (setCommunications) {
      upsertCommunications(communicationsRef.current, searchResult, setCommunications);
    }
    setLoading(false);
  }, [medplum, setCommunications, query]);

  useEffect(() => {
    searchMessages().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [searchMessages]);

  // Reset scroll state when thread changes
  useEffect(() => {
    setHasInitialScroll(false);
  }, [query]);

  useSubscription(
    `Communication?${query}`,
    (bundle: Bundle) => {
      const communication = bundle.entry?.[1]?.resource as Communication;
      if (setCommunications) {
        upsertCommunications(communicationsRef.current, [communication], setCommunications);
      }
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
    async (formData: Record<string, string>) => {
      console.log('sendMessageInternal called', { subject, inputDisabled, medplumProfile: medplum.getProfile() });
      if (inputDisabled) { return; }
      if (inputRef.current) { 
        inputRef.current.value = '';
        // Clear draft text when message is sent
        if (query) {
          draftTextMap.delete(query);
        }
      }
      const message = formData.message;
      if (!message) { return; }

      const profile = medplum.getProfile() as Practitioner;
      if (!profile) { 
        console.log('No profile returned from medplum.getProfile()');
        return; 
      }
      if (!subject) {
        console.log('No subject provided to BaseChat');
        return;
      }

      // Ensure subject is a Patient resource
      const senderRef = createReference(profile);
      const patientReference = getPatientReference(subject);
      const patientDisplay = await getPatientDisplay(subject, medplum);
      const patientReferenceWithDisplay = {
        reference: patientReference,
        display: patientDisplay,
      };

      console.log('Creating Communication with', {
        sender: senderRef,
        subject: patientReferenceWithDisplay,
        recipient: [patientReferenceWithDisplay],
        message
      });

      medplum.createResource<Communication>({
        resourceType: 'Communication',
        status: 'in-progress',
        sender: senderRef,
        subject: patientReferenceWithDisplay,
        recipient: [patientReferenceWithDisplay],
        sent: new Date().toISOString(),
        payload: [{ contentString: message }],
      }).catch((err) => {
        if (onError) { 
          onError(err); 
        }
        else { 
          showError(normalizeErrorString(err)); 
        }
        console.log('Error creating Communication', err);
      });
    },
    [inputDisabled, medplum, onError, subject, query]
  );

  // Disabled because we can make sure this will trigger an update when local profile !== medplum.getProfile()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const latestProfile = medplum.getProfile();
    if (profile?.id !== latestProfile?.id) {
      setProfile(latestProfile);
      if (setCommunications) {
        setCommunications([]);
      }
    }
  });

  const [parentRef, parentRect] = useResizeObserver<HTMLDivElement>();

  const communicationsRef = useRef<Communication[]>(communications);
  communicationsRef.current = communications;

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

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [communications]);

  if (!profile) {
    return null;
  }

  // Group communications by date
  const groupedByDate: Record<string, Communication[]> = {};
  communications.forEach((c) => {
    if (!c.sent) { return; }
    const key = getDateKey(c.sent);
    if (!groupedByDate[key]) { groupedByDate[key] = []; }
    groupedByDate[key].push(c);
  });
  // Get sorted date keys
  const sortedDateKeys = Object.keys(groupedByDate).sort((a, b) => {
    // Sort by date ascending
    return new Date(a).getTime() - new Date(b).getTime();
  });

  return (
    <Paper className={classes.chatPaper} p={0} radius="md" {...paperProps}>
      <div className={classes.chatBody} ref={parentRef as LegacyRef<HTMLDivElement>}>
        <ScrollArea 
          viewportRef={scrollAreaRef} 
          className={classes.chatScrollArea} 
          h={parentRect.height}
          scrollbarSize={10}
          type="hover"
          scrollHideDelay={250}
        >
          <div style={{ padding: 16 }} className={classes.chatMessagesContainer}>
            {sortedDateKeys.map((dateKey) => {
              const dateGroup = groupedByDate[dateKey];
              const centeredTimestamp = formatCenteredTimestamp(dateGroup[0].sent as string);
              return (
                <Stack key={dateKey} align="stretch" style={{ marginBottom: 24, marginTop: 24 }}>
                  <div style={{ textAlign: 'center', fontSize: 12, margin: '8px 0', color: 'gray' }}>{centeredTimestamp}</div>
                  {dateGroup.map((c) => {
                    // Determine alignment
                    let alignment: 'left' | 'right' = 'left';
                    if (rightAlignReference && c.sender?.reference === rightAlignReference) {
                      alignment = 'right';
                    } else if (!rightAlignReference && c.sender?.reference === profileRefStr) {
                      alignment = 'right';
                    }
                    return (
                      <Stack key={`${c.id}--${c.meta?.versionId ?? 'no-version'}`} align="stretch">
                        {alignment === 'right' ? (
                          <Group justify="flex-end" align="flex-end" gap="xs" mb="sm">
                            <ChatBubble
                              alignment="right"
                              communication={c}
                              showDelivered={!!c.received && c.id === myLastDeliveredId}
                            />
                            <ResourceAvatar radius="xl" value={c.sender} />
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
                </Stack>
              );
            })}
          </div>
        </ScrollArea>
      </div>
      <div className={classes.chatInputContainer}>
        <Form onSubmit={sendMessageInternal}>
          <div className={classes.inputWrapper}>
            <Textarea
              ref={inputRef}
              size='md'
              name="message"
              placeholder={!inputDisabled ? `Write a message to ${recipientName ?? 'recipient'}…` : 'Replies are disabled'}
              radius="md"
              minRows={4}
              maxRows={4}
              autosize
              disabled={inputDisabled}
              className={classes.textareaWithButton}
              classNames={{ input: classes.textareaInputPadding }}
              style={{ width: '100%' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  // Find the closest form and submit it
                  const form = e.currentTarget.closest('form');
                  if (form) {
                    form.requestSubmit();
                  }
                }
              }}
            />
            {!inputDisabled && (
              <ActionIcon
                type="submit"
                size="2rem"
                radius="xl"
                color="blue"
                variant="filled"
                aria-label="Send message"
                className={classes.sendButtonInside}
              >
                <IconArrowRight size="1.5rem" stroke={2} />
              </ActionIcon>
            )}
          </div>
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
  const senderName = senderResource ? getDisplayString(senderResource) : '[Unknown sender]';
  const timeOnly = formatBubbleTime(communication.sent as string);

  // Function to convert URLs to clickable links
  const convertUrlsToLinks = (text: string): JSX.Element[] => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{ 
              // Patient messages (right-aligned) use lighter blue for better contrast on dark background
              color: alignment === 'right' ? 'var(--mantine-color-blue-3)' : 'var(--mantine-color-blue-6)',
              textDecoration: 'underline' 
            }}
          >
            {part}
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className={classes.chatBubbleOuterWrap}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: alignment === 'right' ? 'flex-end' : 'flex-start',
          alignItems: 'center',
          gap: 8,
          color: '#888',
          fontSize: 12,
          fontWeight: 400,
          margin: '2px 4px 4px 4px',
          textAlign: alignment === 'right' ? 'right' : 'left',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--mantine-color-gray-8)' }}>{senderName}</span>
        <span>{timeOnly}</span>
      </div>
      <div
        className={
          alignment === 'left' ? classes.chatBubbleLeftAlignedInnerWrap : classes.chatBubbleRightAlignedInnerWrap
        }
      >
        <div 
          className={classes.chatBubble}
          style={{
            // Patient messages (right-aligned) have dark background with white text
            // Practitioner messages (left-aligned) have light background with dark text
            backgroundColor: alignment === 'right' 
              ? 'var(--mantine-color-gray-8)' 
              : 'var(--mantine-color-gray-0)',
            color: alignment === 'right'
              ? 'var(--mantine-color-white)'
              : 'var(--mantine-color-dark)'
          }}
        >
          {convertUrlsToLinks(content)}
        </div>
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
