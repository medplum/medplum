// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PaperProps } from '@mantine/core';
import {
  ActionIcon,
  Group,
  LoadingOverlay,
  Menu,
  Paper,
  Popover,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure, useResizeObserver } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import type { ProfileResource, WithId } from '@medplum/core';
import { getDisplayString, getReferenceString, normalizeErrorString } from '@medplum/core';
import type { Attachment, Bundle, Communication, DocumentReference, Reference } from '@medplum/fhirtypes';
import { useCachedBinaryUrl, useDictation, useMedplum, useResource, useSubscription } from '@medplum/react-hooks';
import {
  IconArrowRight,
  IconBrowserShare,
  IconCheck,
  IconCircleFilled,
  IconEye,
  IconFiles,
  IconFileText,
  IconHistory,
  IconMicrophone,
  IconPaperclip,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form } from '../../Form/Form';
import { ResourceAvatar } from '../../ResourceAvatar/ResourceAvatar';
import classes from './BaseChat.module.css';
import { DocumentPickerList, truncateMiddle } from './DocumentPicker';

/**
 * Returns the URL only when its scheme is http or https, blocking javascript: / data: XSS vectors.
 * @param url - The URL to validate.
 * @returns The URL if safe, otherwise undefined.
 */
function toSafeUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' || protocol === 'blob:' ? url : undefined;
  } catch {
    return undefined;
  }
}

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
      return a.sent.localeCompare(b.sent);
    });
  }

  setCommunications(newCommunications);
}

export interface BaseChatProps extends PaperProps {
  readonly title: string;
  readonly communications: Communication[];
  readonly setCommunications: (communications: Communication[]) => void;
  readonly query: string;
  readonly sendMessage: (content: string, file?: File, existingDocRef?: DocumentReference) => void;
  readonly onMessageReceived?: (message: Communication) => void;
  readonly onMessageUpdated?: (message: Communication) => void;
  readonly inputDisabled?: boolean;
  readonly excludeHeader?: boolean;
  readonly onError?: (err: Error) => void;
  readonly uploadEnabled?: boolean;
  readonly dictationEnabled?: boolean;
  readonly attachmentSubjectRef?: Reference;
  readonly onViewInDocuments?: (reference: Reference<DocumentReference>) => void;
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
    uploadEnabled = false,
    dictationEnabled = false,
    attachmentSubjectRef,
    onViewInDocuments,
    ...paperProps
  } = props;
  const medplum = useMedplum();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const firstScrollRef = useRef(true);
  const initialLoadRef = useRef(true);

  const [profile, setProfile] = useState(medplum.getProfile());
  const [reconnecting, setReconnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingFile, setPendingFile] = useState<File | undefined>(undefined);
  const [pendingDocRef, setPendingDocRef] = useState<DocumentReference | undefined>(undefined);
  const [scrollable, setScrollable] = useState(false);
  // The textarea is uncontrolled, so mirror whether it has text to drive the send button state
  const [hasText, setHasText] = useState(false);

  // Track whether the textarea has grown past its max height and become scrollable
  const handleInput = useCallback(() => {
    const el = inputRef.current;
    if (el) {
      setScrollable(el.scrollHeight > el.clientHeight + 1);
      setHasText(el.value.trim().length > 0);
    }
  }, []);
  const [pickerOpen, pickerHandlers] = useDisclosure(false);
  // The attach popover swaps between its root menu and the recent-documents view in place
  const [pickerView, setPickerView] = useState<'menu' | 'recent'>('menu');
  const pickerDropdownRef = useRef<HTMLDivElement>(null);
  const inputBoxRef = useRef<HTMLDivElement>(null);
  // Attach menu target width: the base 220 widened by ~a third, but never wider than the input box less 10px
  const [attachMenuWidth, setAttachMenuWidth] = useState(293);

  useEffect(() => {
    if (!pickerOpen) {
      return undefined;
    }
    // The dropdown is anchored under the paperclip, ~10px in from the box's left edge (the box's
    // padding-inline). Subtract that left inset plus another ~10px so the right edge sits inside the
    // input box rather than aligning with (or overflowing) it. Otherwise use the wider default.
    const boxWidth = inputBoxRef.current?.offsetWidth;
    setAttachMenuWidth(boxWidth ? Math.min(293, boxWidth - 20) : 293);
    const handler = (e: MouseEvent): void => {
      // Skip the attach button itself; its own onClick toggles the menu. Closing here would let the
      // button's click re-open it after this handler's re-render flips pickerOpen back to false.
      if (
        pickerDropdownRef.current &&
        !pickerDropdownRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('[aria-label="Attach file"]')
      ) {
        pickerHandlers.close();
      }
    };
    // Delay registration so the opening click doesn't immediately close
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handler);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', handler);
    };
  }, [pickerOpen, pickerHandlers]);

  // Re-focus textarea when picker closes
  const prevPickerOpen = useRef(false);
  useEffect(() => {
    if (prevPickerOpen.current && !pickerOpen) {
      inputRef.current?.focus();
      // View is reset to the root menu on open, not here, so the recent view stays visible
      // through the close transition instead of flashing the root menu
    }
    prevPickerOpen.current = pickerOpen;
  }, [pickerOpen]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // The textarea is uncontrolled, so write through the native setter and fire an
  // input event so the autosize/scrollable handlers run
  const setInputValue = useCallback((value: string): void => {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, []);

  // Dictation: speech streams into the textarea; the user accepts or cancels, nothing auto-sends
  const {
    dictating,
    isRecording: isDictationRecording,
    startDictation,
    cancelDictation,
    acceptDictation,
  } = useDictation({
    getValue: () => inputRef.current?.value ?? '',
    setValue: setInputValue,
    focusInput: () => inputRef.current?.focus(),
    onError: (err) => showError(normalizeErrorString(err)),
  });

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
      const message = formData.message?.trim() ?? '';
      if (!message && !pendingFile && !pendingDocRef) {
        return;
      }
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      setScrollable(false);
      setHasText(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      sendMessage(message, pendingFile, pendingDocRef);
      setPendingFile(undefined);
      setPendingDocRef(undefined);
      scrollToBottomRef.current = true;
    },
    [inputDisabled, sendMessage, pendingFile, pendingDocRef]
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

  const communicationsRef = useRef(communications);
  communicationsRef.current = communications;
  const prevCommunicationsRef = useRef(communications);

  const scrollToBottomRef = useRef(true);

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

  if (!profile) {
    return null;
  }

  let inputPlaceholder = 'Replies are disabled';
  if (dictating) {
    inputPlaceholder = 'Start speaking—your transcribed words will appear here.';
  } else if (!inputDisabled) {
    inputPlaceholder = 'Type a message...';
  }

  return (
    <Paper className={classes.chatPaper} p={0} radius="md" {...paperProps}>
      {!excludeHeader && (
        <Title order={2} className={classes.chatTitle}>
          {title}
        </Title>
      )}
      <div className={classes.chatBody} ref={parentRef}>
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
          <ScrollArea
            viewportRef={scrollAreaRef}
            className={classes.chatScrollArea}
            classNames={{ viewport: classes.chatScrollAreaViewport }}
            h={parentRect.height}
          >
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
              const payloads = c.payload ?? [];
              const contentRef = payloads.find((p) => p.contentReference)?.contentReference;
              const contentAttachment = payloads.find((p) => p.contentAttachment)?.contentAttachment;
              const hasAttachment = !!(contentRef || contentAttachment);
              const isSender = c.sender?.reference === profileRefStr;
              const menu = hasAttachment ? (
                <ChatBubbleMenu
                  contentRef={contentRef}
                  contentAttachment={contentAttachment}
                  onViewInDocuments={onViewInDocuments}
                />
              ) : null;
              return (
                <Stack key={`${c.id}--${c.meta?.versionId ?? 'no-version'}`} align="stretch">
                  {(!prevCommTime || currCommTime !== prevCommTime) && (
                    <Text fz="xs" ta="center">
                      {currCommTime}
                    </Text>
                  )}
                  {isSender ? (
                    <Group justify="flex-end" align="flex-end" gap="xs" mb="sm">
                      <ChatBubble alignment="right" communication={c} menu={menu} />
                      <ResourceAvatar radius="xl" color="orange" value={c.sender} mb="sm" />
                    </Group>
                  ) : (
                    <Group justify="flex-start" align="flex-end" gap="xs" mb="sm">
                      <ResourceAvatar radius="xl" value={c.sender} mb="sm" />
                      <ChatBubble alignment="left" communication={c} menu={menu} />
                    </Group>
                  )}
                </Stack>
              );
            })}
          </ScrollArea>
        )}
      </div>
      <div className={classes.chatInputContainer}>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          disabled={inputDisabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setPendingFile(file);
              setPendingDocRef(undefined);
            }
          }}
        />
        <Form onSubmit={sendMessageInternal}>
          <div
            ref={inputBoxRef}
            className={classes.chatInputBox}
            data-disabled={inputDisabled || undefined}
            data-scrollable={scrollable ? 'true' : undefined}
            onMouseDown={(e: React.MouseEvent) => {
              // Keep textarea focused when clicking anywhere in the input box
              if (!(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement)) {
                e.preventDefault();
                inputRef.current?.focus();
              }
            }}
          >
            {(pendingFile || pendingDocRef) &&
              (() => {
                const fullName = pendingDocRef
                  ? (pendingDocRef.description ?? pendingDocRef.content?.[0]?.attachment?.title ?? 'Document')
                  : (pendingFile?.name ?? 'File');
                const displayName = truncateMiddle(fullName, 24);
                const isTruncated = displayName !== fullName;
                return (
                  <Tooltip label={fullName} openDelay={500} position="top" disabled={!isTruncated}>
                    <div className={classes.chatAttachmentPill}>
                      {pendingDocRef ? (
                        <IconFileText size="0.875rem" color="var(--mantine-color-dimmed)" />
                      ) : (
                        <IconPaperclip size="0.875rem" color="var(--mantine-color-dimmed)" />
                      )}
                      <Text fz="xs">{displayName}</Text>
                      <button
                        type="button"
                        className={classes.chatAttachmentPillDismiss}
                        onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                        onClick={() => {
                          setPendingDocRef(undefined);
                          setPendingFile(undefined);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                          inputRef.current?.focus();
                        }}
                        aria-label="Remove attachment"
                      >
                        <IconX size="0.75rem" />
                      </button>
                    </div>
                  </Tooltip>
                );
              })()}
            <Textarea
              ref={inputRef}
              name="message"
              placeholder={inputPlaceholder}
              disabled={inputDisabled}
              autoFocus={!inputDisabled}
              autosize
              minRows={1}
              maxRows={6}
              classNames={{ root: classes.chatTextareaRoot, input: classes.chatTextarea }}
              onChange={handleInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  // Enter during dictation only confirms the transcript; Send submits explicitly
                  if (dictating) {
                    acceptDictation();
                    return;
                  }
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className={classes.chatActionBar}>
              {dictating && (
                <div className={classes.listeningStatus} data-state={isDictationRecording ? 'recording' : 'connecting'}>
                  <span className={classes.listeningDotWrapper} aria-hidden>
                    <IconCircleFilled size={16} />
                  </span>
                  <Text fz="xs" fw={400} ml={2} className={classes.listeningLabel} aria-live="polite">
                    {isDictationRecording ? 'Listening…' : 'Connecting…'}
                  </Text>
                </div>
              )}
              {!dictating && !inputDisabled && uploadEnabled && (
                <Popover opened={pickerOpen} position="top-start" shadow="md" radius="md">
                  <Popover.Target>
                    <Tooltip label="Attach" position="top" openDelay={100} disabled={pickerOpen}>
                      <ActionIcon
                        type="button"
                        onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                        onClick={() => {
                          if (pickerOpen) {
                            pickerHandlers.close();
                          } else {
                            // Reset to the root menu before opening so it's never visible during the
                            // close transition (resetting on close flashes the root menu over the fade-out)
                            setPickerView('menu');
                            pickerHandlers.open();
                            inputRef.current?.focus();
                          }
                        }}
                        size={32}
                        radius="xl"
                        color="dark"
                        variant="subtle"
                        className={classes.subtleActionButton}
                        data-selected={pickerOpen || undefined}
                        aria-label="Attach file"
                      >
                        <IconPaperclip size={16} stroke={2} />
                      </ActionIcon>
                    </Tooltip>
                  </Popover.Target>
                  <Popover.Dropdown
                    ref={pickerDropdownRef}
                    className={classes.attachMenuDropdown}
                    p={4}
                    {...(pickerView === 'recent' ? { w: attachMenuWidth } : { miw: 220 })}
                    onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                    onFocusCapture={(e: React.FocusEvent) => {
                      // Allow focus on the search input, redirect everything else back to textarea
                      if (!(e.target instanceof HTMLInputElement)) {
                        e.preventDefault();
                        inputRef.current?.focus();
                      }
                    }}
                  >
                    <Menu closeOnItemClick={false}>
                      {pickerView === 'recent' ? (
                        <DocumentPickerList
                          subjectRef={attachmentSubjectRef}
                          onSelect={(doc) => {
                            setPendingDocRef(doc);
                            setPendingFile(undefined);
                            pickerHandlers.close();
                          }}
                        />
                      ) : (
                        <>
                          <Menu.Item
                            leftSection={<IconHistory size={16} color="var(--mantine-color-dimmed)" />}
                            onClick={() => setPickerView('recent')}
                          >
                            <Text size="sm">Recent Documents</Text>
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconUpload size={16} color="var(--mantine-color-dimmed)" />}
                            onClick={() => {
                              pickerHandlers.close();
                              fileInputRef.current?.click();
                            }}
                          >
                            <Text size="sm">Upload a file or image</Text>
                          </Menu.Item>
                        </>
                      )}
                    </Menu>
                  </Popover.Dropdown>
                </Popover>
              )}
              {!dictating && (inputDisabled || !uploadEnabled) && <div />}
              {!inputDisabled && (
                <Group gap={8}>
                  {dictating ? (
                    <>
                      <Tooltip label="Cancel" position="top" openDelay={100}>
                        <ActionIcon
                          type="button"
                          onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                          onClick={cancelDictation}
                          size={32}
                          radius="xl"
                          color="dark"
                          variant="subtle"
                          className={classes.subtleActionButton}
                          aria-label="Cancel dictation"
                        >
                          <IconX size={16} stroke={2} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Accept" position="top" openDelay={100}>
                        <ActionIcon
                          type="button"
                          onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                          onClick={acceptDictation}
                          size={32}
                          radius="xl"
                          color="blue"
                          variant="filled"
                          aria-label="Accept dictated text"
                        >
                          <IconCheck size={16} stroke={2} />
                        </ActionIcon>
                      </Tooltip>
                    </>
                  ) : (
                    <>
                      {dictationEnabled && (
                        <Tooltip label="Dictate" position="top" openDelay={100}>
                          <ActionIcon
                            type="button"
                            onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                            onClick={startDictation}
                            size={32}
                            radius="xl"
                            color="dark"
                            variant="subtle"
                            className={classes.subtleActionButton}
                            aria-label="Dictate"
                          >
                            <IconMicrophone size={16} stroke={2} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <Tooltip label="Send" position="top" openDelay={100}>
                        <ActionIcon
                          type="submit"
                          size={32}
                          radius="xl"
                          color="blue"
                          variant="filled"
                          className={classes.sendActionButton}
                          aria-label="Send message"
                          disabled={!hasText && !pendingFile && !pendingDocRef}
                        >
                          <IconArrowRight size={16} stroke={2} />
                        </ActionIcon>
                      </Tooltip>
                    </>
                  )}
                </Group>
              )}
            </div>
          </div>
        </Form>
      </div>
    </Paper>
  );
}

interface ChatBubbleProps {
  readonly communication: Communication;
  readonly alignment: 'left' | 'right';
  readonly menu?: JSX.Element | null;
}

function ChatBubble(props: ChatBubbleProps): JSX.Element {
  const { communication, alignment, menu } = props;
  const payloads = communication.payload ?? [];
  const textContent = payloads.find((p) => p.contentString)?.contentString ?? '';
  const contentRef = payloads.find((p) => p.contentReference)?.contentReference;
  const attachment = payloads.find((p) => p.contentAttachment)?.contentAttachment;
  const hasAttachment = !!(contentRef || attachment);
  const sentTime = new Date(communication.sent ?? -1);
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
          {Number.isNaN(sentTime.getTime())
            ? ''
            : sentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </Text>
      </Text>
      {hasAttachment && (
        <div
          className={alignment === 'left' ? classes.chatBubbleAttachmentRowLeft : classes.chatBubbleAttachmentRowRight}
        >
          <div className={classes.chatBubble}>
            {contentRef && <ChatBubbleDocumentReference reference={contentRef} hasText={false} />}
            {attachment && <ChatBubbleAttachment attachment={attachment} hasText={false} />}
          </div>
          {menu && <div className={classes.chatBubbleMenuInline}>{menu}</div>}
        </div>
      )}
      {textContent && (
        <div
          className={
            alignment === 'left' ? classes.chatBubbleLeftAlignedInnerWrap : classes.chatBubbleRightAlignedInnerWrap
          }
        >
          <div className={classes.chatBubble}>
            <span>{textContent}</span>
          </div>
        </div>
      )}
      {!hasAttachment && !textContent && (
        <div
          className={
            alignment === 'left' ? classes.chatBubbleLeftAlignedInnerWrap : classes.chatBubbleRightAlignedInnerWrap
          }
        >
          <div className={classes.chatBubble} />
        </div>
      )}
    </div>
  );
}

interface ChatBubbleAttachmentProps {
  readonly attachment: Attachment;
  readonly hasText: boolean;
}

function ChatBubbleAttachment({ attachment, hasText }: ChatBubbleAttachmentProps): JSX.Element {
  return (
    <div className={hasText ? classes.chatBubbleAttachmentWithText : undefined}>
      <Group gap={4} wrap="nowrap">
        <span className={classes.chatBubbleAttachmentIcon}>
          <IconPaperclip size="0.75rem" />
        </span>
        <Text fz="xs" truncate>
          {attachment.title ?? 'File attached'}
        </Text>
      </Group>
    </div>
  );
}

interface ChatBubbleDocumentReferenceProps {
  readonly reference: Reference;
  readonly hasText: boolean;
}

function ChatBubbleDocumentReference({ reference, hasText }: ChatBubbleDocumentReferenceProps): JSX.Element {
  const docRef = useResource<DocumentReference>(reference as Reference<DocumentReference>);
  const attachment = docRef?.content?.[0]?.attachment;
  if (!attachment) {
    return (
      <div className={hasText ? classes.chatBubbleAttachmentWithText : undefined}>
        <Group gap={4} wrap="nowrap">
          <span className={classes.chatBubbleAttachmentIcon}>
            <IconPaperclip size="0.75rem" />
          </span>
          <Text fz="xs" truncate>
            <Skeleton height="0.75rem" width={120} radius="sm" display="inline-block" />
          </Text>
        </Group>
      </div>
    );
  }
  return <ChatBubbleAttachment attachment={attachment} hasText={hasText} />;
}

interface ChatBubbleMenuProps {
  readonly contentRef?: Reference;
  readonly contentAttachment?: Attachment;
  readonly onViewInDocuments?: (reference: Reference<DocumentReference>) => void;
}

function ChatBubbleMenu({ contentRef, contentAttachment, onViewInDocuments }: ChatBubbleMenuProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const docRef = useResource<DocumentReference>(contentRef as Reference<DocumentReference> | undefined);
  const attachment = contentRef ? docRef?.content?.[0]?.attachment : contentAttachment;
  const cachedUrl = useCachedBinaryUrl(attachment?.url);

  const handleOpenInBrowser = (): void => {
    const href = toSafeUrl(cachedUrl ?? attachment?.url);
    if (!href) {
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <Menu withinPortal position="bottom-start" shadow="md" radius="md" onChange={setMenuOpen}>
      <Menu.Target>
        <Tooltip label="Open Attachment" position="top" openDelay={100} disabled={menuOpen}>
          <ActionIcon
            variant="transparent"
            radius="xl"
            size={32}
            className="outline-icon-button"
            aria-label="Open Attachment"
          >
            <IconEye size={16} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {contentRef && onViewInDocuments && (
          <Menu.Item
            className={classes.chatBubbleMenuItem}
            leftSection={<IconFiles size={16} color="var(--mantine-color-dimmed)" />}
            onClick={() => onViewInDocuments(contentRef as Reference<DocumentReference>)}
          >
            <Text size="sm">Open in Documents</Text>
          </Menu.Item>
        )}
        <Menu.Item
          className={classes.chatBubbleMenuItem}
          leftSection={<IconBrowserShare size={16} color="var(--mantine-color-dimmed)" />}
          onClick={handleOpenInBrowser}
        >
          <Text size="sm">Open in Browser</Text>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
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
