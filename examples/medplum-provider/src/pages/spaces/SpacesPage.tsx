// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Paper, Text, Box, ScrollArea, Group, Flex, ActionIcon, Transition, CloseButton } from '@mantine/core';
import type { JSX } from 'react';
import { useState, useRef, useEffect } from 'react';
import { useMedplum } from '@medplum/react';
import { IconHistory } from '@tabler/icons-react';
import { showErrorNotification } from '../../utils/notifications';
import { ResourceBox } from '../../components/spaces/ResourceBox';
import { ResourcePanel } from '../../components/spaces/ResourcePanel';
import type { Message } from '../../types/spaces';
import { createConversationTopic, saveMessage, loadConversationMessages } from './space-persistence';
import { ConversationList } from './ConversationList';
import { ChatInput } from './ChatInput';
import type { Identifier } from '@medplum/fhirtypes';
import { getReferenceString } from '@medplum/core';
import classes from './SpacesPage.module.css';
import cx from 'clsx';

const fhirRequestToolsId: Identifier = {
  value: 'ai-fhir-request-tools',
  system: 'https://www.medplum.com/bots',
};

const resourceSummaryBotId: Identifier = {
  value: 'ai-resource-summary',
  system: 'https://www.medplum.com/bots',
};

export function SpacesPage(): JSX.Element {
  const medplum = useMedplum();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-5');
  const [hasStarted, setHasStarted] = useState(false);
  const [currentFhirRequest, setCurrentFhirRequest] = useState<string | undefined>();
  const [topicId, setTopicId] = useState<string | undefined>();
  const [historyOpened, setHistoryOpened] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedResource, setSelectedResource] = useState<string | undefined>();
  const scrollViewportRef = useRef<HTMLDivElement>(null);

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
      setTopicId(selectedTopicId);
      setHasStarted(true);
      setSelectedResource(undefined);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setLoading(false);
    }
  };

  const handleHistoryClick = (): void => {
    setRefreshKey((prev) => prev + 1); // Refresh the conversation list
    setHistoryOpened((prev) => !prev);
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
      let currentTopicId = topicId;
      if (isFirstMessage) {
        const topic = await createConversationTopic(medplum, input.substring(0, 100), selectedModel);
        currentTopicId = topic.id;
        setTopicId(currentTopicId);
      }

      // Save user message
      if (currentTopicId) {
        await saveMessage(medplum, currentTopicId, userMessage, currentMessages.length - 1);
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
        if (currentTopicId) {
          await saveMessage(medplum, currentTopicId, assistantMessageWithToolCalls, currentMessages.length - 1);
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
              if (currentTopicId) {
                await saveMessage(medplum, currentTopicId, toolMessage, currentMessages.length - 1);
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
              if (currentTopicId) {
                await saveMessage(medplum, currentTopicId, toolErrorMessage, currentMessages.length - 1);
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
        if (currentTopicId) {
          await saveMessage(medplum, currentTopicId, assistantMessage, currentMessages.length);
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

  // Centered layout before first message
  if (!hasStarted) {
    return (
      <Flex h="calc(100vh - 68px)" style={{ position: 'relative' }}>
        <Transition mounted={historyOpened} transition="slide-right" duration={200}>
          {(styles) => (
            <Box
              w={320}
              style={{
                ...styles,
              }}
            >
              <ConversationList key={refreshKey} currentTopicId={topicId} onSelectTopic={handleSelectTopic} />
            </Box>
          )}
        </Transition>

        <Box p="md">
          <ActionIcon size="lg" variant="subtle" onClick={handleHistoryClick} c="gray">
            <IconHistory size={20} />
          </ActionIcon>
        </Box>

        <Stack justify="center" align="center" p="sm" style={{ flex: 1 }}>
          <Box
            w="100%"
            className={hasStarted ? classes.fadeOut : undefined}
            style={{
              maxWidth: '700px',
            }}
          >
            <Text size="xl" fw={700} mb="xs">
              Start a New Space
            </Text>

            <ChatInput
              input={input}
              onInputChange={setInput}
              onKeyDown={handleKeyDown}
              onSend={handleSend}
              loading={loading}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              backgroundColor="white"
            />
          </Box>
        </Stack>
      </Flex>
    );
  }

  // Chat layout after first message
  return (
    <Flex h="calc(100vh - 68px)">
      {/* History Sidebar */}
      <Transition mounted={historyOpened} transition="slide-right" duration={200}>
        {(styles) => (
          <Paper className={classes.borderRight} w={320} style={{ ...styles, position: 'relative' }}>
            <ConversationList key={refreshKey} currentTopicId={topicId} onSelectTopic={handleSelectTopic} />
          </Paper>
        )}
      </Transition>

      {/* Main content column - chat/resource + input */}
      <Flex direction="column" style={{ flex: 1 }}>
        {/* Chat and Resource panels row */}
        <Flex style={{ overflow: 'hidden', flex: 1 }}>
          {/* Chat Section */}
          <Paper
            className={cx(classes.fadeIn, selectedResource ? classes.borderRight : undefined)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Group justify="space-between" p="md">
              <Group gap="xs">
                <ActionIcon size="lg" variant="subtle" c="gray" onClick={handleHistoryClick}>
                  <IconHistory size={20} />
                </ActionIcon>

                <Text size="xl" fw={700}>
                  AI Assistant
                </Text>
              </Group>
            </Group>

            <ScrollArea style={{ flex: 1 }} offsetScrollbars viewportRef={scrollViewportRef}>
              <Stack gap="md" p="md">
                {visibleMessages.map((message, index) => (
                  <Box
                    key={index}
                    style={{
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '70%',
                      width: message.role === 'assistant' && message.resources ? '100%' : undefined,
                    }}
                  >
                    <Paper p="md" withBorder bg={message.role === 'user' ? 'violet.0' : undefined}>
                      <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
                    </Paper>

                    {message.resources && message.resources.length > 0 && (
                      <Stack gap="xs" mt="sm">
                        {message.resources.map((resourceRef, idx) => (
                          <ResourceBox key={idx} resourceReference={resourceRef} onClick={setSelectedResource} />
                        ))}
                      </Stack>
                    )}
                  </Box>
                ))}
                {loading && (
                  <Paper p="md" withBorder style={{ alignSelf: 'flex-start', maxWidth: '70%' }}>
                    <Text c="dimmed">{currentFhirRequest ? `Executing ${currentFhirRequest}` : 'Thinking...'}</Text>
                  </Paper>
                )}
              </Stack>
            </ScrollArea>
          </Paper>

          {/* Right Panel for Resource Details */}
          {selectedResource && (
            <Paper className={classes.previewResource}>
              <Group justify="space-between" p="md">
                <Text size="lg" fw={600}>
                  Resource Details
                </Text>
                <CloseButton onClick={() => setSelectedResource(undefined)} />
              </Group>
              <ScrollArea style={{ flex: 1 }} p="md">
                <ResourcePanel key={selectedResource} resource={{ reference: selectedResource }} />
              </ScrollArea>
            </Paper>
          )}
        </Flex>

        {/* Input at bottom */}
        <Paper className={classes.borderTop}>
          <Box w="50%" style={{ margin: '0 auto' }} p="md">
            <ChatInput
              input={input}
              onInputChange={setInput}
              onKeyDown={handleKeyDown}
              onSend={handleSend}
              loading={loading}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          </Box>
        </Paper>
      </Flex>
    </Flex>
  );
}
