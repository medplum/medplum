// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Button, Paper, Text, Box, ScrollArea, Group, Flex, ActionIcon, Transition } from '@mantine/core';
import type { JSX } from 'react';
import { useState, useRef, useEffect } from 'react';
import { useMedplum } from '@medplum/react';
import { IconTrash, IconHistory } from '@tabler/icons-react';
import { showErrorNotification } from '../../utils/notifications';
import { MessageWithLinks } from '../../components/MessageWithLinks';
import { SYSTEM_MESSAGE, SUMMARY_SYSTEM_MESSAGE, FHIR_TOOLS } from './ai-prompts';
import type { Message } from '../../types/spaces';
import { createConversationTopic, saveMessage, loadConversationMessages } from './space-persistence';
import { ConversationList } from './ConversationList';
import { ChatInput } from './ChatInput';
import classes from './SpacesPage.module.css';
import type { Identifier } from '@medplum/fhirtypes';

const botId: Identifier = {
  value: 'ai-api-bot',
  system: 'https://www.medplum.com/bots',
};

export function SpacesPage(): JSX.Element {
  const medplum = useMedplum();
  const [messages, setMessages] = useState<Message[]>([SYSTEM_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-5');
  const [hasStarted, setHasStarted] = useState(false);
  const [currentFhirRequest, setCurrentFhirRequest] = useState<string | undefined>();
  const [topicId, setTopicId] = useState<string | undefined>();
  const [historyOpened, setHistoryOpened] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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

  const handleClear = (): void => {
    setMessages([SYSTEM_MESSAGE]);
    setHasStarted(false);
    setTopicId(undefined);
  };

  const handleSelectTopic = async (selectedTopicId: string): Promise<void> => {
    try {
      setLoading(true);
      const loadedMessages = await loadConversationMessages(medplum, selectedTopicId);
      setMessages([SYSTEM_MESSAGE, ...loadedMessages]);
      setTopicId(selectedTopicId);
      setHasStarted(true);
    } catch (error: any) {
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
      let response = await medplum.executeBot(botId, {
        resourceType: 'Parameters',
        parameter: [
          { name: 'messages', valueString: JSON.stringify(currentMessages) },
          { name: 'model', valueString: selectedModel },
          { name: 'tools', valueString: JSON.stringify(FHIR_TOOLS) },
          { name: 'temperature', valueString: '0.3' },
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
                  if (entry.resource?.resourceType && entry.resource?.id) {
                    allResourceRefs.push(`${entry.resource.resourceType}/${entry.resource.id}`);
                  }
                });
              } else if (result?.resourceType && result?.id) {
                allResourceRefs.push(`${result.resourceType}/${result.id}`);
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

        // Second AI request: summarize the FHIR response
        // Use the existing conversation context but replace system message with summary version
        const summaryMessages = [
          {
            role: 'system',
            content: SUMMARY_SYSTEM_MESSAGE,
          },
          ...currentMessages.slice(1), // Skip original system message, include all conversation
        ];

        response = await medplum.executeBot(botId, {
          resourceType: 'Parameters',
          parameter: [
            { name: 'messages', valueString: JSON.stringify(summaryMessages) },
            { name: 'model', valueString: selectedModel },
            { name: 'temperature', valueString: '0.3' },
          ],
        });
      }

      // To be replaced for Resource display
      const content = response.parameter?.find((p: any) => p.name === 'content')?.valueString;
      if (content) {
        let finalContent = content;
        if (allResourceRefs.length > 0) {
          const uniqueRefs = [...new Set(allResourceRefs)];
          finalContent = `${content}\n\nResources Found:\n${uniqueRefs.map((ref) => `• ${ref}`).join('\n')}`;
        }
        const assistantMessage: Message = { role: 'assistant', content: finalContent };
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
      <Transition mounted={historyOpened} transition="slide-right" duration={200}>
        {(styles) => (
          <Box
            style={{
              ...styles,
              width: '320px',
              borderRight: '1px solid #e9ecef',
              position: 'relative',
            }}
          >
            <ConversationList key={refreshKey} currentTopicId={topicId} onSelectTopic={handleSelectTopic} />
          </Box>
        )}
      </Transition>

      <Stack
        p="md"
        className={classes.fadeIn}
        style={{
          flex: 1,
        }}
      >
        <Group justify="space-between">
          <Group gap="xs">
            <ActionIcon size="lg" variant="subtle" c="gray" onClick={handleHistoryClick}>
              <IconHistory size={20} />
            </ActionIcon>

            <Text size="xl" fw={700}>
              AI Assistant
            </Text>
          </Group>

          <Group gap="xs">
            <Text size="sm" c="dimmed">
              {visibleMessages.length} messages
            </Text>
            <Button size="xs" variant="subtle" color="red" onClick={handleClear} leftSection={<IconTrash size={14} />}>
              Clear
            </Button>
          </Group>
        </Group>

        <ScrollArea style={{ flex: 1 }} offsetScrollbars viewportRef={scrollViewportRef}>
          <Stack gap="md" p="xs">
            {visibleMessages.map((message, index) => (
              <Paper
                key={index}
                p="md"
                withBorder
                style={{
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '70%',
                  backgroundColor: message.role === 'user' ? '#F8F0FC' : '#f5f5f5',
                }}
              >
                {message.role === 'assistant' ? (
                  <MessageWithLinks content={message.content || ''} />
                ) : (
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
                )}
              </Paper>
            ))}
            {loading && (
              <Paper p="md" withBorder style={{ alignSelf: 'flex-start', maxWidth: '70%' }}>
                <Text c="dimmed">{currentFhirRequest ? `Executing ${currentFhirRequest}` : 'Thinking...'}</Text>
              </Paper>
            )}
          </Stack>
        </ScrollArea>

        <Box w="50%" style={{ margin: '0 auto' }}>
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
      </Stack>
    </Flex>
  );
}
