// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, Box, ScrollArea, Group, ActionIcon, CloseButton, Avatar, ThemeIcon, Button } from '@mantine/core';
import type { JSX } from 'react';
import { useState, useRef, useEffect } from 'react';
import { useMedplum, useResource } from '@medplum/react';
import {
  IconRobot,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPlus,
  IconCode,
} from '@tabler/icons-react';
import { showErrorNotification } from '../../utils/notifications';
import { ResourceBox } from './ResourceBox';
import { ResourcePanel } from './ResourcePanel';
import { ComponentPreview } from './ComponentPreview';
import type { Message } from '../../types/spaces';
import { loadConversationMessages } from '../../utils/spacePersistence';
import { processMessage } from '../../utils/spaceMessaging';
import { HistoryList } from './HistoryList';
import { ChatInput, DEFAULT_MODEL } from '../../pages/spaces/ChatInput';
import type { Communication, Reference } from '@medplum/fhirtypes';
import classes from './SpacesInbox.module.css';
import cx from 'clsx';

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
  const [currentTopicId, setCurrentTopicId] = useState<string | undefined>(topic?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedResource, setSelectedResource] = useState<string | undefined>();
  const [streamingContent, setStreamingContent] = useState<string | undefined>();
  const [componentPreview, setComponentPreview] = useState<{ code: string } | undefined>();
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);
  const loadVersionRef = useRef(0);

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
          setComponentPreview(undefined);
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
      setComponentPreview(undefined);
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
    setLoading(true);
    isSendingRef.current = true;
    loadVersionRef.current++;

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
      });
      setStreamingContent(undefined);
      setMessages(result.updatedMessages);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setMessages([...currentMessages, { role: 'assistant', content: `Error: ${errorMessage}` }]);
    } finally {
      isSendingRef.current = false;
      setStreamingContent(undefined);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend().catch((error) => showErrorNotification(error));
    }
  };

  const handleViewComponent = (code: string): void => {
    setSelectedResource(undefined);
    setComponentPreview({ code });
  };

  const visibleMessages = messages.filter(
    (m) => m.role !== 'system' && m.role !== 'tool' && !(m.role === 'assistant' && m.tool_calls)
  );

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
      <div className={classes.chatContainer}>
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
                {visibleMessages.map((message, index) => (
                  <div
                    key={index}
                    className={cx(
                      classes.messageWrapper,
                      message.role === 'user' ? classes.userMessage : classes.assistantMessage
                    )}
                  >
                    <Group align="flex-start" gap="sm" mb={4}>
                      {message.role === 'assistant' && (
                        <Avatar radius="xl" size="sm" color="blue">
                          <IconRobot size={14} />
                        </Avatar>
                      )}
                      <Text fw={600} size="sm" c="dimmed">
                        {message.role === 'user' ? 'You' : 'AI Assistant'}
                      </Text>
                    </Group>
                    <div className={classes.messageContent}>
                      <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
                    </div>
                    {message.resources && message.resources.length > 0 && (
                      <Stack gap="xs" mt="sm" w={300} ml={message.role === 'assistant' ? 0 : 'auto'}>
                        {message.resources.map((resourceRef, idx) => (
                          <ResourceBox
                            key={idx}
                            resourceReference={resourceRef}
                            onClick={(ref) => {
                              setComponentPreview(undefined);
                              setSelectedResource(ref);
                            }}
                          />
                        ))}
                      </Stack>
                    )}
                    {message.componentCode && (
                      <Button
                        variant="light"
                        size="xs"
                        leftSection={<IconCode size={14} />}
                        mt="sm"
                        onClick={() => {
                          if (message.componentCode) {
                            handleViewComponent(message.componentCode);
                          }
                        }}
                      >
                        View Component
                      </Button>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className={cx(classes.messageWrapper, classes.assistantMessage)}>
                    <Group align="flex-start" gap="sm" mb={4}>
                      <Avatar radius="xl" size="sm" color="blue">
                        <IconRobot size={14} />
                      </Avatar>
                      <Text fw={600} size="sm" c="dimmed">
                        AI Assistant
                      </Text>
                    </Group>
                    <div className={classes.messageContent}>
                      {streamingContent ? (
                        <Text style={{ whiteSpace: 'pre-wrap' }}>{streamingContent}</Text>
                      ) : (
                        <Text size="sm" c="dimmed" fs="italic">
                          {currentFhirRequest ? `Executing ${currentFhirRequest}...` : 'Thinking...'}
                        </Text>
                      )}
                    </div>
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

      {/* Resource Panel */}
      {selectedResource && (
        <div className={classes.resourcePanel}>
          <div className={classes.resourceHeader}>
            <Text fw={600} size="sm">
              Resource Details
            </Text>
            <CloseButton onClick={() => setSelectedResource(undefined)} />
          </div>
          <ScrollArea style={{ flex: 1 }} p="md">
            <ResourcePanel key={selectedResource} resource={{ reference: selectedResource }} />
          </ScrollArea>
        </div>
      )}

      {/* Component Preview Panel */}
      {componentPreview && (
        <div className={classes.resourcePanel}>
          <div className={classes.resourceHeader}>
            <Text fw={600} size="sm">
              Component Preview
            </Text>
            <CloseButton onClick={() => setComponentPreview(undefined)} />
          </div>
          <ScrollArea style={{ flex: 1 }} p="md">
            <ComponentPreview code={componentPreview.code} />
          </ScrollArea>
        </div>
      )}
    </>
  );
}
