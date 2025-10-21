// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, TextInput, Button, Paper, Text, Box, ScrollArea, Group, Select } from '@mantine/core';
import type { JSX } from 'react';
import { useState, useRef, useEffect } from 'react';
import { useMedplum } from '@medplum/react';
import { IconSend, IconTrash } from '@tabler/icons-react';
import { showErrorNotification } from '../../utils/notifications';
import { MessageWithLinks } from '../../components/MessageWithLinks';
import { SYSTEM_MESSAGE, SUMMARY_SYSTEM_MESSAGE, FHIR_TOOLS } from './ai-prompts';

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
}

const MODELS = [
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
];

export function SpacesPage(): JSX.Element {
  const medplum = useMedplum();
  const [messages, setMessages] = useState<Message[]>([SYSTEM_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-5');
  const [hasStarted, setHasStarted] = useState(false);
  const [currentFhirRequest, setCurrentFhirRequest] = useState<string | undefined>();
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
  };

  const handleSend = async (): Promise<void> => {
    if (!input.trim()) {
      return;
    }

    if (!hasStarted) {
      setHasStarted(true);
    }

    const userMessage: Message = { role: 'user', content: input };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInput('');
    setCurrentFhirRequest(undefined);
    setLoading(true);

    try {
      let response = await medplum.executeBot('9bce4942-3b77-4d8c-b025-e324da963810', {
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
        const assistantMessageWithToolCalls: any = {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls,
        };
        currentMessages.push(assistantMessageWithToolCalls);

        let hasFailedRequest = false;

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

              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            } catch (err: any) {
              hasFailedRequest = true;
              const errorResult = {
                error: true,
                message: `Unable to execute ${method}: ${path}`,
                details: err.message || 'Unknown error',
              };

              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(errorResult),
              });
            }
          }
        }

        if (hasFailedRequest) {
          const summaryMessages = [
            {
              role: 'system',
              content: SUMMARY_SYSTEM_MESSAGE,
            },
            ...currentMessages.slice(1),
          ];

          response = await medplum.executeBot('9bce4942-3b77-4d8c-b025-e324da963810', {
            resourceType: 'Parameters',
            parameter: [
              { name: 'messages', valueString: JSON.stringify(summaryMessages) },
              { name: 'model', valueString: selectedModel },
              { name: 'temperature', valueString: '0.3' },
            ],
          });

          const content = response.parameter?.find((p: any) => p.name === 'content')?.valueString;
          if (content) {
            setMessages([...currentMessages, { role: 'assistant', content }]);
          }
          setLoading(false);
          return;
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

        response = await medplum.executeBot('9bce4942-3b77-4d8c-b025-e324da963810', {
          resourceType: 'Parameters',
          parameter: [
            { name: 'messages', valueString: JSON.stringify(summaryMessages) },
            { name: 'model', valueString: selectedModel },
            { name: 'temperature', valueString: '0.3' },
          ],
        });
      }

      const content = response.parameter?.find((p: any) => p.name === 'content')?.valueString;
      if (content) {
        let finalContent = content;
        if (allResourceRefs.length > 0) {
          const uniqueRefs = [...new Set(allResourceRefs)];
          finalContent = `${content}\n\nResources Found:\n${uniqueRefs.map((ref) => `• ${ref}`).join('\n')}`;
        }
        setMessages([...currentMessages, { role: 'assistant', content: finalContent }]);
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
      <Stack h="calc(100vh - 68px)" justify="center" align="center" p="sm">
        <Box
          w="100%"
          style={{
            maxWidth: '700px',
            animation: hasStarted ? 'fadeOut 0.3s ease-out' : 'none',
          }}
        >
          <Text size="xl" fw={700} mb="xs">
            Start a New Space
          </Text>

          <Paper p="md" radius="lg" withBorder bg="white">
            <Group gap="md" wrap="nowrap" align="center">
              <TextInput
                placeholder="Ask, search, or make anything..."
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                style={{ flex: 1 }}
                styles={{
                  input: {
                    border: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '15px',
                    padding: 0,
                  },
                }}
              />
              <Select
                size="xs"
                data={MODELS}
                value={selectedModel}
                onChange={(value) => setSelectedModel(value ?? 'gpt-5')}
                styles={{
                  input: {
                    border: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#666',
                    minWidth: '100px',
                    cursor: 'pointer',
                  },
                }}
              />
              <Button
                radius="xl"
                size="sm"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                w="36px"
                h="36px"
                bg="#7c3aed"
                p={0}
              >
                <IconSend size={18} />
              </Button>
            </Group>
          </Paper>
        </Box>
      </Stack>
    );
  }

  // Chat layout after first message
  return (
    <Stack
      h="calc(100vh - 68px)"
      p="md"
      style={{
        animation: 'fadeIn 0.3s ease-in',
      }}
    >
      <Group justify="space-between">
        <Text size="xl" fw={700}>
          AI Assistant
        </Text>

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

      <Box>
        <Paper p="md" radius="lg" withBorder style={{ backgroundColor: '#fff' }}>
          <Group gap="md" wrap="nowrap" align="center">
            <TextInput
              placeholder="Ask, search, or make anything..."
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              style={{ flex: 1 }}
              styles={{
                input: {
                  border: 'none',
                  backgroundColor: 'transparent',
                  fontSize: '15px',
                  padding: 0,
                },
              }}
            />
            <Select
              size="xs"
              data={MODELS}
              value={selectedModel}
              onChange={(value) => setSelectedModel(value ?? 'gpt-5')}
              styles={{
                input: {
                  border: 'none',
                  backgroundColor: 'transparent',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#666',
                  minWidth: '100px',
                  cursor: 'pointer',
                },
              }}
            />
            <Button
              radius="xl"
              size="sm"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              w="36px"
              h="36px"
              bg="#7c3aed"
              p={0}
            >
              <IconSend size={18} />
            </Button>
          </Group>
        </Paper>
      </Box>

      <style>{`
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </Stack>
  );
}
