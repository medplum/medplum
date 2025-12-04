// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, Box, ScrollArea, Group, ActionIcon, CloseButton, Avatar, ThemeIcon } from '@mantine/core';
import type { JSX } from 'react';
import { useState, useRef, useEffect } from 'react';
import { useMedplum, useResource } from '@medplum/react';
import { IconRobot, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconPlus } from '@tabler/icons-react';
import { showErrorNotification } from '../../utils/notifications';
import { ResourceBox } from './ResourceBox';
import { ResourcePanel } from './ResourcePanel';
import type { Message } from '../../types/spaces';
import { createConversationTopic, saveMessage, loadConversationMessages } from '../../utils/spacePersistence';
import { HistoryList } from './HistoryList';
import { ChatInput } from '../../pages/spaces/ChatInput';
import type { Identifier, Communication, Reference } from '@medplum/fhirtypes';
import { getReferenceString } from '@medplum/core';
import classes from './SpacesInbox.module.css';
import cx from 'clsx';

const fhirRequestToolsId: Identifier = {
  value: 'ai-fhir-request-tools',
  system: 'https://www.medplum.com/bots',
};

const resourceSummaryBotId: Identifier = {
  value: 'ai-resource-summary',
  system: 'https://www.medplum.com/bots',
};

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
  const [selectedModel, setSelectedModel] = useState('gpt-5');
  const [hasStarted, setHasStarted] = useState(false);
  const [currentFhirRequest, setCurrentFhirRequest] = useState<string | undefined>();
  const [currentTopicId, setCurrentTopicId] = useState<string | undefined>(topic?.id);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedResource, setSelectedResource] = useState<string | undefined>();
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  // Load conversation when topic changes
  useEffect(() => {
    const topicId = topic?.id;
    if (topicId) {
      const loadTopic = async (): Promise<void> => {
        try {
          setLoading(true);
          const loadedMessages = await loadConversationMessages(medplum, topicId);
          setMessages([...loadedMessages]);
          setCurrentTopicId(topicId);
          setHasStarted(true);
          setSelectedResource(undefined);
        } catch (error) {
          showErrorNotification(error);
        } finally {
          setLoading(false);
        }
      };
      loadTopic().catch(showErrorNotification);
    } else {
      // Reset state when no topic is selected
      setMessages([]);
      setHasStarted(false);
      setCurrentTopicId(undefined);
      setSelectedResource(undefined);
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
  }, [messages, hasStarted]);

  const handleSelectTopic = async (selectedTopicId: string): Promise<void> => {
    try {
      setLoading(true);
      const loadedMessages = await loadConversationMessages(medplum, selectedTopicId);
      setMessages([...loadedMessages]);
      setCurrentTopicId(selectedTopicId);
      setHasStarted(true);
      setSelectedResource(undefined);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setLoading(false);
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
    setLoading(true);

    try {
      // Create topic on first message
      let activeTopicId = currentTopicId;
      if (isFirstMessage) {
        const topic = await createConversationTopic(medplum, input.substring(0, 100), selectedModel);
        activeTopicId = topic.id;
        setCurrentTopicId(activeTopicId);
        setRefreshKey((prev) => prev + 1); // Refresh list to show new topic
        // Notify parent to navigate to the new topic
        onNewTopic(topic);
      }

      // Save user message
      if (activeTopicId) {
        await saveMessage(medplum, activeTopicId, userMessage, currentMessages.length - 1);
      }
      let response = await medplum.executeBot(fhirRequestToolsId, {
        resourceType: 'Parameters',
        parameter: [
          { name: 'messages', valueString: JSON.stringify(currentMessages) },
          { name: 'model', valueString: selectedModel },
        ],
      });

      const toolCallsStr = response.parameter?.find((p: any) => p.name === 'tool_calls')?.valueString;
      const allResourceRefs: string[] = [];

      if (toolCallsStr) {
        const toolCalls = JSON.parse(toolCallsStr);
        const assistantMessageWithToolCalls: Message = {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls,
        };
        currentMessages.push(assistantMessageWithToolCalls);

        // Save tool call message
        if (activeTopicId) {
          await saveMessage(medplum, activeTopicId, assistantMessageWithToolCalls, currentMessages.length - 1);
        }

        for (const toolCall of toolCalls) {
          if (toolCall.function.name === 'fhir_request') {
            const args =
              typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments;

            const { method, path, body } = args;
            setCurrentFhirRequest(`${method} ${path}`);
            let result;
            try {
              if (method === 'GET') {
                result = await medplum.get(medplum.fhirUrl(path));
              } else if (method === 'POST') {
                result = await medplum.post(medplum.fhirUrl(path), body);
              } else if (method === 'PUT') {
                result = await medplum.put(medplum.fhirUrl(path), body);
              } else if (method === 'DELETE') {
                result = await medplum.delete(medplum.fhirUrl(path));
              }

              if (result?.resourceType === 'Bundle' && result?.entry) {
                result.entry.forEach((entry: any) => {
                  if (entry.resource) {
                    const ref = getReferenceString(entry.resource);
                    if (ref) {
                      allResourceRefs.push(ref);
                    }
                  }
                });
              } else if (result) {
                const ref = getReferenceString(result);
                if (ref) {
                  allResourceRefs.push(ref);
                }
              }

              const toolMessage: Message = {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              };
              currentMessages.push(toolMessage);

              // Save tool response message
              if (activeTopicId) {
                await saveMessage(medplum, activeTopicId, toolMessage, currentMessages.length - 1);
              }
            } catch (err: any) {
              const errorResult = {
                error: true,
                message: `Unable to execute ${method}: ${path}`,
                details: err.message || 'Unknown error',
              };

              const toolErrorMessage: Message = {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(errorResult),
              };
              currentMessages.push(toolErrorMessage);

              // Save tool error message
              if (activeTopicId) {
                await saveMessage(medplum, activeTopicId, toolErrorMessage, currentMessages.length - 1);
              }
            }
          }
        }

        response = await medplum.executeBot(resourceSummaryBotId, {
          resourceType: 'Parameters',
          parameter: [
            { name: 'messages', valueString: JSON.stringify(currentMessages) },
            { name: 'model', valueString: selectedModel },
          ],
        });
      }

      const content = response.parameter?.find((p: any) => p.name === 'content')?.valueString;
      if (content) {
        const uniqueRefs = allResourceRefs.length > 0 ? [...new Set(allResourceRefs)] : undefined;
        const assistantMessage: Message = {
          role: 'assistant',
          content,
          resources: uniqueRefs,
        };
        setMessages([...currentMessages, assistantMessage]);

        // Save assistant message
        if (activeTopicId) {
          await saveMessage(medplum, activeTopicId, assistantMessage, currentMessages.length);
        }
      }
    } catch (error: any) {
      setMessages([...currentMessages, { role: 'assistant', content: `Error: ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend().catch((error) => showErrorNotification(error));
    }
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
                          <ResourceBox key={idx} resourceReference={resourceRef} onClick={setSelectedResource} />
                        ))}
                      </Stack>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className={cx(classes.messageWrapper, classes.assistantMessage)}>
                    <Group align="center" gap="sm" wrap="nowrap">
                      <Avatar radius="xl" size="sm" color="blue">
                        <IconRobot size={14} />
                      </Avatar>
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" c="dimmed" fs="italic" truncate>
                          {currentFhirRequest ? `Executing ${currentFhirRequest}...` : 'Thinking...'}
                        </Text>
                      </Box>
                    </Group>
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
    </>
  );
}
