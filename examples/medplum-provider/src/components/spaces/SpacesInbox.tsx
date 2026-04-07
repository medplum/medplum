// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Badge,
  Box,
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
import type { Communication, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react';
import {
  IconArrowLeft,
  IconCode,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconList,
  IconPlus,
  IconRobot,
} from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ChatInput, DEFAULT_MODEL } from '../../pages/spaces/ChatInput';
import type { Message } from '../../types/spaces';
import { showErrorNotification } from '../../utils/notifications';
import { processMessage } from '../../utils/spaceMessaging';
import { loadConversationMessages } from '../../utils/spacePersistence';
import { ComponentPreview } from './ComponentPreview';
import { HistoryList } from './HistoryList';
import { ResourceBox } from './ResourceBox';
import { ResourcePanel } from './ResourcePanel';
import classes from './SpacesInbox.module.css';

interface SpaceInboxProps {
  topic: Communication | Reference<Communication> | undefined;
  onNewTopic: (topic: Communication) => void;
  onSelectedItem: (topic: Communication) => string;
  onAdd?: () => void;
}

export function SpacesInbox(props: SpaceInboxProps): JSX.Element {
  const { topic: topicRef, onNewTopic, onSelectedItem, onAdd } = props;
  const medplum = useMedplum();
  const topic = useResource(topicRef);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentFhirRequest, setCurrentFhirRequest] = useState<string | undefined>();
  const [currentTopicId, setCurrentTopicId] = useState(topic?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedResource, setSelectedResource] = useState<string | undefined>();
  const [selectedResources, setSelectedResources] = useState<string[] | undefined>();
  const [resourceFromComponent, setResourceFromComponent] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | undefined>();
  const [streamingComponentCode, setStreamingComponentCode] = useState<string | undefined>();
  const [componentPanelOpen, setComponentPanelOpen] = useState(false);
  const [componentPreview, setComponentPreview] = useState<{ code: string; resources?: string[] } | undefined>();
  const [expandedResponses, setExpandedResponses] = useState<Set<number>>(new Set());
  const [panelWidth, setPanelWidth] = useState<number>(() => window.innerWidth * 0.5);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);
  const loadVersionRef = useRef(0);
  const componentStreamOpenedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const handleDragStart = (e: React.MouseEvent): void => {
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent): void => {
      if (!isDraggingRef.current) {
        return;
      }
      const delta = dragStartXRef.current - moveEvent.clientX;
      const containerWidth = chatContainerRef.current?.parentElement?.offsetWidth ?? window.innerWidth;
      const newWidth = Math.min(
        Math.max(dragStartWidthRef.current + delta, containerWidth * 0.5),
        containerWidth * 0.75
      );
      setPanelWidth(newWidth);
    };

    const onMouseUp = (): void => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Load conversation when topic changes
  useEffect(() => {
    const topicId = topic?.id;
    if (topicId) {
      if (isSendingRef.current) {
        return;
      }
      loadVersionRef.current++;
      const myVersion = loadVersionRef.current;
      const loadTopic = async (): Promise<void> => {
        try {
          setLoading(true);
          const loadedMessages = await loadConversationMessages(medplum, topicId);
          // Check if this load is stale (a newer load or send has started)
          if (myVersion !== loadVersionRef.current) {
            return;
          }
          setMessages([...loadedMessages]);
          setCurrentTopicId(topicId);
          setHasStarted(true);
          setSelectedResource(undefined);
          setSelectedResources(undefined);
          setComponentPreview(undefined);
          setStreamingComponentCode(undefined);
          setComponentPanelOpen(false);
        } catch (error) {
          showErrorNotification(error);
        } finally {
          if (myVersion === loadVersionRef.current) {
            setLoading(false);
          }
        }
      };
      loadTopic().catch(showErrorNotification);
    } else {
      setMessages([]);
      setHasStarted(false);
      setCurrentTopicId(undefined);
      setSelectedResource(undefined);
      setSelectedResources(undefined);
      setComponentPreview(undefined);
    }
  }, [topic, medplum]);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (viewport && hasStarted) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, hasStarted, streamingContent]);

  // Scroll again after loading finishes to show resources
  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (viewport && hasStarted && !loading) {
      const timer = setTimeout(() => {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'smooth',
        });
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [loading, hasStarted]);

  const handleSelectTopic = async (selectedTopicId: string): Promise<void> => {
    loadVersionRef.current++;
    const myVersion = loadVersionRef.current;
    try {
      setLoading(true);
      const loadedMessages = await loadConversationMessages(medplum, selectedTopicId);
      if (myVersion !== loadVersionRef.current) {
        return;
      }
      setMessages([...loadedMessages]);
      setCurrentTopicId(selectedTopicId);
      setHasStarted(true);
      setSelectedResource(undefined);
      setSelectedResources(undefined);
      setComponentPreview(undefined);
      setStreamingComponentCode(undefined);
      setComponentPanelOpen(false);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      if (myVersion === loadVersionRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSend = async (): Promise<void> => {
    if (!input.trim()) {
      return;
    }

    const isFirstMessage = !hasStarted;
    if (isFirstMessage) {
      setHasStarted(true);
    }

    const userMessage: Message = { role: 'user', content: input };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInput('');
    setCurrentFhirRequest(undefined);
    setStreamingContent(undefined);
    setComponentPreview(undefined);
    setLoading(true);
    isSendingRef.current = true;
    loadVersionRef.current++;
    componentStreamOpenedRef.current = false;

    try {
      const result = await processMessage({
        medplum,
        input,
        userMessage,
        currentMessages,
        currentTopicId,
        selectedModel,
        isFirstMessage,
        setCurrentTopicId,
        setRefreshKey,
        setCurrentFhirRequest,
        onNewTopic,
        onStreamChunk: (chunk) => {
          setStreamingContent((prev) => (prev ?? '') + chunk);
          setCurrentFhirRequest(undefined);
        },
        onComponentStreamChunk: (chunk) => {
          if (!componentStreamOpenedRef.current) {
            setSelectedResource(undefined);
            setSelectedResources(undefined);
            setComponentPanelOpen(true);
            componentStreamOpenedRef.current = true;
          }
          setStreamingComponentCode((prev) => (prev ?? '') + chunk);
          setCurrentFhirRequest(undefined);
        },
      });
      setStreamingContent(undefined);
      setStreamingComponentCode(undefined);
      setMessages(result.updatedMessages);
      if (result.assistantMessage.componentCode) {
        setComponentPreview({
          code: result.assistantMessage.componentCode,
          resources: result.assistantMessage.resources,
        });
        setSelectedResource(undefined);
        setComponentPanelOpen(true);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setMessages([...currentMessages, { role: 'assistant', content: `Error: ${errorMessage}` }]);
    } finally {
      isSendingRef.current = false;
      setStreamingContent(undefined);
      setStreamingComponentCode(undefined);
      setLoading(false);
      // componentPanelOpen intentionally left as-is so the panel stays open after streaming
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend().catch((error) => showErrorNotification(error));
    }
  };

  const toggleResponse = (index: number): void => {
    setExpandedResponses((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const visibleMessages = messages.filter((m) => m.role !== 'system');

  return (
    <>
      {/* Sidebar */}
      <Box className={classes.sidebar} style={{ width: sidebarOpen ? 280 : 0, opacity: sidebarOpen ? 1 : 0 }}>
        <div className={classes.sidebarHeader}>
          <Text className={classes.sidebarTitle}>Conversations</Text>
          <ActionIcon variant="subtle" color="gray" onClick={() => setSidebarOpen(false)}>
            <IconLayoutSidebarLeftCollapse size={18} />
          </ActionIcon>
        </div>
        <div className={classes.sidebarContent}>
          <HistoryList
            key={refreshKey}
            currentTopicId={currentTopicId}
            onSelectTopic={handleSelectTopic}
            onSelectedItem={onSelectedItem}
          />
        </div>
      </Box>

      {/* Main Chat Area */}
      <div ref={chatContainerRef} className={classes.chatContainer}>
        <div className={classes.chatHeader}>
          <div>
            {!sidebarOpen && (
              <ActionIcon variant="subtle" color="gray" onClick={() => setSidebarOpen(true)} mr="md">
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
            <ScrollArea style={{ flex: 1 }} offsetScrollbars viewportRef={scrollViewportRef}>
              <Stack gap="xl" p="xs">
                {visibleMessages.map((message, index) => {
                  // FHIR tool call — show method + path
                  if (message.role === 'assistant' && message.tool_calls && !message.content) {
                    return (
                      <div key={index} className={cx(classes.messageWrapper, classes.assistantMessage)}>
                        <Stack gap={6}>
                          {message.tool_calls.map((tc, tcIdx) => {
                            let args: { method?: string; path?: string } = {};
                            try {
                              args =
                                typeof tc.function.arguments === 'string'
                                  ? JSON.parse(tc.function.arguments)
                                  : tc.function.arguments;
                            } catch {
                              /* ignore */
                            }
                            const methodColors: Record<string, string> = {
                              GET: 'blue',
                              POST: 'green',
                              PUT: 'orange',
                              DELETE: 'red',
                            };
                            return (
                              <Group key={tcIdx} gap="xs" align="center">
                                <Badge size="sm" color={methodColors[args.method ?? ''] ?? 'gray'} variant="filled">
                                  {args.method ?? 'CALL'}
                                </Badge>
                                <Code style={{ fontSize: 12 }}>{args.path ?? tc.function.name}</Code>
                              </Group>
                            );
                          })}
                        </Stack>
                      </div>
                    );
                  }

                  // Tool response — collapsible JSON
                  if (message.role === 'tool') {
                    const isExpanded = expandedResponses.has(index);
                    let prettyContent = message.content ?? '';
                    try {
                      prettyContent = JSON.stringify(JSON.parse(message.content ?? ''), null, 2);
                    } catch {
                      /* use raw */
                    }
                    return (
                      <div key={index} className={cx(classes.messageWrapper, classes.assistantMessage)}>
                        <Group
                          gap="xs"
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => toggleResponse(index)}
                        >
                          <Text size="xs" fw={500} c="dimmed">
                            Response
                          </Text>
                          <Text size="xs" c="dimmed">
                            {isExpanded ? '▲' : '▼'}
                          </Text>
                        </Group>
                        <Collapse in={isExpanded}>
                          <Code
                            block
                            style={{ maxHeight: 300, overflow: 'auto', marginTop: 6, fontSize: 11, whiteSpace: 'pre' }}
                          >
                            {prettyContent}
                          </Code>
                        </Collapse>
                      </div>
                    );
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
                      {message.content && (
                        <div className={classes.messageContent}>
                          <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
                        </div>
                      )}
                      {message.componentCode && (
                        <Stack gap="xs" mt="sm" w={300} ml={message.role === 'assistant' ? 0 : 'auto'}>
                          <Paper
                            withBorder
                            p="sm"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setSelectedResource(undefined);
                              setSelectedResources(undefined);
                              setComponentPreview({
                                code: message.componentCode as string,
                                resources: message.resources,
                              });
                              setComponentPanelOpen(true);
                            }}
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
                                onClick={(ref) => {
                                  setComponentPanelOpen(false);
                                  setResourceFromComponent(false);
                                  setSelectedResources(undefined);
                                  setSelectedResource(ref);
                                }}
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
                {loading && (
                  <div className={cx(classes.messageWrapper, classes.assistantMessage)}>
                    <div className={classes.messageContent}>
                      {streamingContent && <Text style={{ whiteSpace: 'pre-wrap' }}>{streamingContent}</Text>}
                      {!streamingContent && currentFhirRequest && (
                        <Text size="sm" c="dimmed" fs="italic">
                          Executing {currentFhirRequest}...
                        </Text>
                      )}
                      {!streamingContent && !currentFhirRequest && streamingComponentCode === undefined && (
                        <Text size="sm" c="dimmed" fs="italic">
                          Thinking...
                        </Text>
                      )}
                    </div>
                    {streamingComponentCode !== undefined && (
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
          <div className={classes.inputWrapper}>
            <ChatInput
              input={input}
              onInputChange={setInput}
              onKeyDown={handleKeyDown}
              onSend={handleSend}
              loading={loading}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              backgroundColor="transparent"
            />
          </div>
        </div>
      </div>

      {/* Resource List Panel */}
      {selectedResources && !selectedResource && <div className={classes.dragHandle} onMouseDown={handleDragStart} />}
      {selectedResources && !selectedResource && (
        <div className={classes.resourcePanel} style={{ width: panelWidth, flex: 'none' }}>
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
      {selectedResource && <div className={classes.dragHandle} onMouseDown={handleDragStart} />}
      {selectedResource && (
        <div className={classes.resourcePanel} style={{ width: panelWidth, flex: 'none' }}>
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
      {componentPanelOpen && (componentPreview || streamingComponentCode !== undefined) && (
        <div className={classes.dragHandle} onMouseDown={handleDragStart} />
      )}
      {componentPanelOpen && (componentPreview || streamingComponentCode !== undefined) && (
        <div className={classes.resourcePanel} style={{ width: panelWidth, flex: 'none' }}>
          <div className={classes.resourceHeader}>
            <Text fw={600} size="sm">
              Component Preview
            </Text>
            <CloseButton onClick={() => setComponentPanelOpen(false)} />
          </div>
          <ScrollArea style={{ flex: 1 }} p="md">
            {streamingComponentCode !== undefined && (
              <Code block style={{ whiteSpace: 'pre-wrap' }}>
                {streamingComponentCode || ' '}
              </Code>
            )}
            {streamingComponentCode === undefined && componentPreview && (
              <ComponentPreview
                code={componentPreview.code}
                resources={componentPreview.resources}
                onResourceClick={(ref) => {
                  setComponentPanelOpen(false);
                  setResourceFromComponent(true);
                  setSelectedResource(ref);
                }}
              />
            )}
          </ScrollArea>
        </div>
      )}
    </>
  );
}
