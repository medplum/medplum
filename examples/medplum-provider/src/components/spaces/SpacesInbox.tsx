// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Badge,
  CloseButton,
  Code,
  Collapse,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { formatDate, getDisplayString } from '@medplum/core';
import type { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { ListWithDetailPane, MedplumLink, useResource } from '@medplum/react';
import {
  IconArrowDown,
  IconArrowLeft,
  IconCode,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconList,
  IconPlus,
  IconRobot,
  IconUser,
} from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedComponent, UseSpacesConversationResult } from '../../hooks/useSpacesConversation';
import { PromptComposer } from '../../pages/spaces/PromptComposer';
import type { Message } from '../../types/spaces';
import { ComponentPreview } from './ComponentPreview';
import { Markdown } from './Markdown';
import { ResourceBox } from './ResourceBox';
import { ResourcePanel } from './ResourcePanel';
import classes from './SpacesInbox.module.css';

// Spaces always renders the chat pane — with no topic selected it is a new (draft)
// conversation — so this placeholder keeps ListWithDetailPane on its detail slot
// instead of swapping to the empty-detail slot, which would remount the chat once
// the first message creates the real topic.
const NEW_CONVERSATION: Communication = { resourceType: 'Communication', status: 'in-progress' };

export interface SpacesInboxProps extends UseSpacesConversationResult {
  onSelectedItem: (topic: Communication) => string;
  onAdd?: () => void;
}

/**
 * The Spaces chat view. All conversation state and async work live in
 * useSpacesConversation; this component only owns what the user sees and clicks.
 * @param props - The conversation state and actions, plus navigation callbacks
 * @returns The chat view with its conversation list and side panels
 */
export function SpacesInbox(props: SpacesInboxProps): JSX.Element {
  const {
    status,
    messages,
    topicId,
    hasStarted,
    topics,
    topicsLoading,
    currentFhirRequest,
    streamingContent,
    streamingComponentCode,
    generatedComponent,
    models,
    model,
    setModel,
    reasoningEffort,
    setReasoningEffort,
    send,
    onSelectedItem,
    onAdd,
  } = props;

  const [input, setInput] = useState('');
  const [selectedPatients, setSelectedPatients] = useState<(Patient | Reference<Patient>)[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<string | undefined>();
  const [selectedResources, setSelectedResources] = useState<string[] | undefined>();
  const [resourceFromComponent, setResourceFromComponent] = useState(false);
  const [componentPanelOpen, setComponentPanelOpen] = useState(false);
  const [componentPreview, setComponentPreview] = useState<GeneratedComponent | undefined>();
  const [expandedResponses, setExpandedResponses] = useState(new Set<string>());
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const sending = status === 'sending';
  const generating = streamingComponentCode !== undefined;

  const [prevTopicId, setPrevTopicId] = useState(topicId);
  if (topicId !== prevTopicId) {
    setPrevTopicId(topicId);
    setSelectedResource(undefined);
    setSelectedResources(undefined);
    setResourceFromComponent(false);
    setComponentPreview(undefined);
    setComponentPanelOpen(false);
    setExpandedResponses(new Set());
    setShowScrollButton(false);
  }

  // Must stay above the scroll effects: effects run in declaration order and they read this ref
  useEffect(() => {
    isAtBottomRef.current = true;
  }, [topicId]);

  // The panel opens on generation start ('' code), not on the first chunk, which can take a while
  const [prevGenerating, setPrevGenerating] = useState(generating);
  if (generating !== prevGenerating) {
    setPrevGenerating(generating);
    if (generating) {
      setSelectedResource(undefined);
      setSelectedResources(undefined);
      setComponentPreview(undefined);
      setComponentPanelOpen(true);
    }
  }

  const [prevGenerated, setPrevGenerated] = useState(generatedComponent);
  if (generatedComponent !== prevGenerated) {
    setPrevGenerated(generatedComponent);
    if (generatedComponent) {
      setSelectedResource(undefined);
      setComponentPreview(generatedComponent);
      setComponentPanelOpen(true);
    }
  }

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (viewport && hasStarted && isAtBottomRef.current) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'auto',
      });
    }
  }, [messages, hasStarted, streamingContent, status, currentFhirRequest, streamingComponentCode]);

  // Scroll again after a send finishes to show resources
  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (viewport && hasStarted && status === 'idle' && isAtBottomRef.current) {
      const timer = setTimeout(() => {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'auto',
        });
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status, hasStarted]);

  // Track whether the user is scrolled to the bottom; pause autoscroll otherwise
  const handleScrollPositionChange = (): void => {
    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return;
    }
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const atBottom = distanceFromBottom < 100;
    isAtBottomRef.current = atBottom;
    setShowScrollButton(!atBottom);
  };

  const scrollToBottom = (): void => {
    const viewport = scrollViewportRef.current;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
    isAtBottomRef.current = true;
    setShowScrollButton(false);
  };

  const handleSend = (overrideInput?: string): void => {
    if (send(overrideInput ?? input, selectedPatients)) {
      setInput('');
      isAtBottomRef.current = true;
      setShowScrollButton(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleResponse = (id: string): void => {
    setExpandedResponses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openResource = (ref: string, fromComponent: boolean): void => {
    setComponentPanelOpen(false);
    setResourceFromComponent(fromComponent);
    setSelectedResources(undefined);
    setSelectedResource(ref);
  };

  const openComponent = (component: GeneratedComponent): void => {
    setSelectedResource(undefined);
    setSelectedResources(undefined);
    setComponentPreview(component);
    setComponentPanelOpen(true);
  };

  const visibleMessages = messages.filter((m) => m.role !== 'system');

  // Map each tool response to the tool call that produced it, so each request can
  // be rendered together with its matching response.
  const toolResponsesByCallId = useMemo(() => {
    const map = new Map<string, Message>();
    for (const message of messages) {
      if (message.role === 'tool' && message.tool_call_id) {
        map.set(message.tool_call_id, message);
      }
    }
    return map;
  }, [messages]);

  return (
    <ListWithDetailPane<Communication>
      items={topics}
      loading={topicsLoading}
      selectedKey={topicId}
      selected={topics.find((t) => t.id === topicId) ?? NEW_CONVERSATION}
      listWidth={280}
      listVisible={sidebarOpen}
      headerText="Conversations"
      headerActions={
        <ActionIcon variant="subtle" color="gray" onClick={() => setSidebarOpen(false)} aria-label="Hide conversations">
          <IconLayoutSidebarLeftCollapse size={18} />
        </ActionIcon>
      }
      emptyList={
        <Text size="sm" c="dimmed" ta="center" mt="md">
          No conversations yet
        </Text>
      }
      renderItem={(item) => <TopicListItem topic={item} uri={onSelectedItem(item)} />}
      renderDetail={() => (
        <>
          {/* Main Chat Area */}
          <div className={classes.chatContainer}>
            <div className={classes.chatHeader}>
              <div>
                {!sidebarOpen && (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => setSidebarOpen(true)}
                    mr="md"
                    aria-label="Show conversations"
                  >
                    <IconLayoutSidebarLeftExpand size={16} />
                  </ActionIcon>
                )}
              </div>
              {onAdd && (
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={onAdd} aria-label="New conversation">
                  <IconPlus size={16} />
                </ActionIcon>
              )}
            </div>

            <div className={classes.messagesArea}>
              {!hasStarted ? (
                <div className={classes.emptyState}>
                  <ThemeIcon size={64} radius="xl" variant="light" color="gray" className={classes.emptyStateIcon}>
                    <IconRobot size={32} />
                  </ThemeIcon>
                  <Text size="xl" fw={500} mb="sm">
                    How can I help you today?
                  </Text>
                  <Text c="dimmed" size="sm" maw={400}>
                    I can help you search for patients, create resources, or answer clinical questions.
                  </Text>
                </div>
              ) : (
                <ScrollArea
                  style={{ flex: 1 }}
                  viewportRef={scrollViewportRef}
                  onScrollPositionChange={handleScrollPositionChange}
                >
                  <Stack gap="xl" py="xl" px={52} w="100%" maw={864} mx="auto">
                    {visibleMessages.map((message, index) => {
                      // FHIR tool calls — show each request paired with its response
                      if (message.role === 'assistant' && message.tool_calls && !message.content) {
                        return (
                          <div key={index} className={cx(classes.messageWrapper, classes.assistantMessage)}>
                            <Stack gap="md">
                              {message.tool_calls.map((tc, tcIdx) => {
                                let args: { method?: string; path?: string } | undefined;
                                try {
                                  args =
                                    typeof tc.function.arguments === 'string'
                                      ? JSON.parse(tc.function.arguments)
                                      : tc.function.arguments;
                                } catch {
                                  /* ignore */
                                }

                                const response = tc.id ? toolResponsesByCallId.get(tc.id) : undefined;
                                const responseKey = tc.id ?? `${index}-${tcIdx}`;
                                const isExpanded = expandedResponses.has(responseKey);
                                let prettyContent = response?.content ?? '';
                                try {
                                  prettyContent = JSON.stringify(JSON.parse(response?.content ?? ''), null, 2);
                                } catch {
                                  /* use raw */
                                }

                                return (
                                  <Stack key={responseKey} gap={6}>
                                    {args ? (
                                      <Group
                                        gap="xs"
                                        align="flex-start"
                                        wrap="nowrap"
                                        className={classes.toolCallGroup}
                                      >
                                        <Badge
                                          size="sm"
                                          color={getMethodColor(args.method)}
                                          variant="filled"
                                          className={classes.toolCallBadge}
                                        >
                                          {args.method ?? 'CALL'}
                                        </Badge>
                                        <Code className={classes.toolCallPath}>{args.path ?? tc.function.name}</Code>
                                      </Group>
                                    ) : (
                                      <Text size="xs" c="dimmed" fs="italic">
                                        Unable to parse tool call
                                      </Text>
                                    )}
                                    {response && (
                                      <>
                                        <Group
                                          gap="xs"
                                          style={{ cursor: 'pointer', userSelect: 'none' }}
                                          onClick={() => toggleResponse(responseKey)}
                                        >
                                          <Text size="xs" fw={500} c="dimmed">
                                            Response
                                          </Text>
                                          <Text size="xs" c="dimmed">
                                            {isExpanded ? '▲' : '▼'}
                                          </Text>
                                        </Group>
                                        <Collapse in={isExpanded}>
                                          <Code block className={classes.toolResponseCode}>
                                            {prettyContent}
                                          </Code>
                                        </Collapse>
                                      </>
                                    )}
                                  </Stack>
                                );
                              })}
                            </Stack>
                          </div>
                        );
                      }

                      // Tool responses are rendered inline with their request above
                      if (message.role === 'tool') {
                        return null;
                      }

                      // Standard user / assistant messages
                      return (
                        <div
                          key={index}
                          className={cx(
                            classes.messageWrapper,
                            message.role === 'user' ? classes.userMessage : classes.assistantMessage
                          )}
                        >
                          {message.role === 'user' &&
                            message.selectedPatients &&
                            message.selectedPatients.length > 0 && (
                              <Stack gap={4} mb={4} align="flex-end">
                                {message.selectedPatients.map((patient, i) => (
                                  <PatientContextBubble key={i} patient={patient} />
                                ))}
                              </Stack>
                            )}
                          {message.content && (
                            <div className={classes.messageContent}>
                              {message.role === 'assistant' ? (
                                <Markdown>{message.content}</Markdown>
                              ) : (
                                <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
                              )}
                            </div>
                          )}
                          {message.componentCode && (
                            <Stack gap="xs" mt="sm" w={300} ml={message.role === 'assistant' ? 0 : 'auto'}>
                              <Paper
                                withBorder
                                p="sm"
                                style={{ cursor: 'pointer' }}
                                onClick={() =>
                                  openComponent({ code: message.componentCode as string, resources: message.resources })
                                }
                              >
                                <Group gap="sm" wrap="nowrap">
                                  <ThemeIcon size="lg" variant="light" color="violet">
                                    <IconCode size={20} />
                                  </ThemeIcon>
                                  <Text size="sm" fw={600} c="violet.7">
                                    View Component
                                  </Text>
                                </Group>
                              </Paper>
                            </Stack>
                          )}
                          {message.resources && message.resources.length > 0 && !message.componentCode && (
                            <Stack gap="xs" mt="sm" w={300} ml={message.role === 'assistant' ? 0 : 'auto'}>
                              {message.resources.length <= 2 ? (
                                message.resources.map((resourceRef, idx) => (
                                  <ResourceBox
                                    key={idx}
                                    resourceReference={resourceRef}
                                    onClick={(ref) => openResource(ref, false)}
                                  />
                                ))
                              ) : (
                                <Paper
                                  withBorder
                                  p="sm"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => {
                                    setComponentPanelOpen(false);
                                    setSelectedResource(undefined);
                                    setResourceFromComponent(false);
                                    setSelectedResources(message.resources);
                                  }}
                                >
                                  <Group gap="sm" wrap="nowrap">
                                    <ThemeIcon size="lg" variant="light" color="violet">
                                      <IconList size={20} />
                                    </ThemeIcon>
                                    <Text size="sm" fw={600} c="violet.7">
                                      {message.resources.length} results
                                    </Text>
                                  </Group>
                                </Paper>
                              )}
                            </Stack>
                          )}
                        </div>
                      );
                    })}
                    {sending && (
                      <div className={cx(classes.messageWrapper, classes.assistantMessage)}>
                        <div className={classes.messageContent}>
                          {streamingContent && <Markdown>{streamingContent}</Markdown>}
                          {!streamingContent && currentFhirRequest && (
                            <Text size="sm" c="dimmed" fs="italic">
                              Executing {currentFhirRequest}...
                            </Text>
                          )}
                          {!streamingContent && !currentFhirRequest && !generating && (
                            <Text size="sm" c="dimmed" fs="italic">
                              Thinking...
                            </Text>
                          )}
                        </div>
                        {generating && (
                          <Stack gap="xs" mt="sm" w={300}>
                            <Paper
                              withBorder
                              p="sm"
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                setSelectedResource(undefined);
                                setComponentPanelOpen(true);
                              }}
                            >
                              <Group gap="sm" wrap="nowrap">
                                <ThemeIcon size="lg" variant="light" color="violet">
                                  <IconCode size={20} />
                                </ThemeIcon>
                                <Text size="sm" fw={600} c="violet.7">
                                  Generating component...
                                </Text>
                              </Group>
                            </Paper>
                          </Stack>
                        )}
                      </div>
                    )}
                  </Stack>
                </ScrollArea>
              )}
            </div>

            <div className={classes.inputArea}>
              {hasStarted && showScrollButton && (
                <div className={classes.scrollToBottomWrapper}>
                  <ActionIcon
                    variant="default"
                    radius="xl"
                    size="lg"
                    className={classes.scrollToBottomButton}
                    onClick={scrollToBottom}
                    aria-label="Scroll to bottom"
                  >
                    <IconArrowDown size={14} />
                  </ActionIcon>
                </div>
              )}
              <div className={classes.inputWrapper}>
                <PromptComposer
                  input={input}
                  onInputChange={setInput}
                  onKeyDown={handleKeyDown}
                  onSend={handleSend}
                  loading={status !== 'idle'}
                  models={models}
                  selectedModel={model}
                  onModelChange={setModel}
                  selectedReasoningEffort={reasoningEffort}
                  onReasoningEffortChange={setReasoningEffort}
                  selectedPatients={selectedPatients}
                  setSelectedPatients={setSelectedPatients}
                />
              </div>
              <Text size="xs" c="gray.6" className={classes.inputDisclaimer}>
                AI models can make mistakes. Please double-check important information.
              </Text>
            </div>
          </div>

          {/* Resource List Panel */}
          {selectedResources && !selectedResource && (
            <div className={classes.resourcePanel}>
              <div className={classes.resourceHeader}>
                <Text fw={600} size="sm">
                  Results ({selectedResources.length})
                </Text>
                <CloseButton onClick={() => setSelectedResources(undefined)} />
              </div>
              <ScrollArea style={{ flex: 1 }} p="md">
                <Stack gap="xs">
                  {selectedResources.map((ref, idx) => (
                    <ResourceBox key={idx} resourceReference={ref} onClick={(r) => setSelectedResource(r)} />
                  ))}
                </Stack>
              </ScrollArea>
            </div>
          )}

          {/* Resource Panel */}
          {selectedResource && (
            <div className={classes.resourcePanel}>
              <div className={classes.resourceHeader}>
                <Group gap="xs">
                  {(resourceFromComponent || selectedResources) && (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={() => {
                        setSelectedResource(undefined);
                        if (resourceFromComponent) {
                          setComponentPanelOpen(true);
                        }
                      }}
                    >
                      <IconArrowLeft size={16} />
                    </ActionIcon>
                  )}
                  <Text fw={600} size="sm">
                    Resource Details
                  </Text>
                </Group>
                <CloseButton
                  onClick={() => {
                    setSelectedResource(undefined);
                    setSelectedResources(undefined);
                  }}
                />
              </div>
              <ScrollArea style={{ flex: 1 }} p="md">
                <ResourcePanel key={selectedResource} resource={{ reference: selectedResource }} />
              </ScrollArea>
            </div>
          )}

          {/* Component Preview Panel */}
          {componentPanelOpen && (componentPreview || generating) && (
            <div className={classes.resourcePanel}>
              <div className={classes.resourceHeader}>
                <Text fw={600} size="sm">
                  Component Preview
                </Text>
                <CloseButton onClick={() => setComponentPanelOpen(false)} />
              </div>
              <ScrollArea style={{ flex: 1 }} p="md">
                {generating && (
                  <Code block style={{ whiteSpace: 'pre-wrap' }}>
                    {streamingComponentCode || ' '}
                  </Code>
                )}
                {!generating && componentPreview && (
                  <ComponentPreview
                    code={componentPreview.code}
                    resources={componentPreview.resources}
                    onResourceClick={(ref) => openResource(ref, true)}
                  />
                )}
              </ScrollArea>
            </div>
          )}
        </>
      )}
    />
  );
}

function TopicListItem({ topic, uri }: { topic: Communication; uri: string }): JSX.Element {
  return (
    <MedplumLink to={uri} underline="never" display="block" c="inherit">
      <Stack gap={4} p="xs">
        <Text size="sm" fw={500} lineClamp={1}>
          {topic.topic?.text || 'Untitled conversation'}
        </Text>
        <Text size="xs" c="dimmed">
          {formatDate(topic.meta?.lastUpdated)}
        </Text>
      </Stack>
    </MedplumLink>
  );
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
};

function getMethodColor(method: string | undefined): string {
  return METHOD_COLORS[method ?? ''] ?? 'gray';
}

function PatientContextBubble({ patient }: { patient: Patient | Reference<Patient> }): JSX.Element {
  const resource = useResource(patient);
  return (
    <div className={classes.contextBubble}>
      <Group gap={4} wrap="nowrap">
        <IconUser size={12} />
        <Text fz="xs">{resource ? getDisplayString(resource) : ''}</Text>
      </Group>
    </div>
  );
}
