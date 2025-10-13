// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, TextInput, Button, Paper, Text, Box, ScrollArea, Group, Select } from '@mantine/core';
import type { JSX } from 'react';
import { useState, useRef, useEffect } from 'react';
import { useMedplum } from '@medplum/react';
import { IconSend, IconTrash } from '@tabler/icons-react';
import { showErrorNotification } from '../../utils/notifications';

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
}

const SYSTEM_MESSAGE: Message = {
  role: 'system',
  content: `You are a helpful healthcare assistant with access to FHIR data through the Medplum platform.

FHIR BASICS:
FHIR (Fast Healthcare Interoperability Resources) is a standard for healthcare data exchange. Key concepts:
- Resources: Structured data types like Patient, Observation, Medication
- References: Links between resources (e.g., Patient/123)
- Search: Query resources using parameters

AVAILABLE RESOURCES:
- Patient, Practitioner, Observation, Condition, MedicationRequest, Appointment, Task, Encounter, DiagnosticReport, DocumentReference

SEARCH EXAMPLES:
- Patient?name=John
- Patient/abc-123
- Observation?subject=Patient/123

COMMON TASKS:
- "Find patient John" → GET Patient?name=John
- "Show patient details" → GET Patient/{id}
- "Create a task" → POST Task
- "Find all observations for patient X" → GET Observation?subject=Patient/{id}

Always maintain conversation context and reference previous searches or data when relevant.`,
};

const MODELS = [
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'o1', label: 'O1' },
  { value: 'o1-mini', label: 'O1 Mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4', label: 'GPT-4' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
];

const FHIR_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fhir_request',
      description:
        'Make a FHIR request to the Medplum server. Use this to search, read, create, update, or delete FHIR resources.',
      parameters: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          },
          path: { type: 'string' },
          body: { type: 'object' },
        },
        required: ['method', 'path'],
      },
    },
  },
];

export function SpacesPage(): JSX.Element {
  const medplum = useMedplum();
  const [messages, setMessages] = useState<Message[]>([SYSTEM_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-5');
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  // Load saved model from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('selectedModel');
    if (saved) {
      setSelectedModel(saved);
    }
  }, []);

  // Persist model to localStorage
  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  const handleClear = (): void => {
    setMessages([SYSTEM_MESSAGE]);
  };

  const handleSend = async (): Promise<void> => {
    if (!input.trim()) {
      return;
    }

    const userMessage: Message = { role: 'user', content: input };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInput('');
    setLoading(true);

    try {
      // First request
      let response = await medplum.executeBot('9bce4942-3b77-4d8c-b025-e324da963810', {
        resourceType: 'Parameters',
        parameter: [
          { name: 'messages', valueString: JSON.stringify(currentMessages) },
          { name: 'model', valueString: selectedModel },
          { name: 'tools', valueString: JSON.stringify(FHIR_TOOLS) },
        ],
      });

      const toolCallsStr = response.parameter?.find((p: any) => p.name === 'tool_calls')?.valueString;

      if (toolCallsStr) {
        const toolCalls = JSON.parse(toolCallsStr);
        const assistantMessageWithToolCalls: any = {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls,
        };
        currentMessages.push(assistantMessageWithToolCalls);

        // Execute FHIR calls locally
        for (const toolCall of toolCalls) {
          if (toolCall.function.name === 'fhir_request') {
            const args =
              typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments;

            const { method, path, body } = args;
            let result;
            try {
              if (method === 'GET') {
                result = await medplum.get(medplum.fhirUrl(path));
              } else if (method === 'POST') {
                result = await medplum.post(medplum.fhirUrl(path), body);
              } else if (method === 'PUT') {
                result = await medplum.put(medplum.fhirUrl(path), body);
              } else if (method === 'PATCH') {
                result = await medplum.patch(medplum.fhirUrl(path), body);
              } else if (method === 'DELETE') {
                result = await medplum.delete(medplum.fhirUrl(path));
              }
            } catch (error: any) {
              result = { error: error.message };
            }

            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          }
        }

        // Send updated messages after FHIR requests
        response = await medplum.executeBot('9bce4942-3b77-4d8c-b025-e324da963810', {
          resourceType: 'Parameters',
          parameter: [
            { name: 'messages', valueString: JSON.stringify(currentMessages) },
            { name: 'model', valueString: selectedModel },
          ],
        });
      }

      const content = response.parameter?.find((p: any) => p.name === 'content')?.valueString;
      if (content) {
        setMessages([...currentMessages, { role: 'assistant', content }]);
      }
    } catch (error: any) {
      setMessages([...currentMessages, { role: 'assistant', content: `Error: ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend().catch((error) => showErrorNotification(error));
    }
  };

  const visibleMessages = messages.filter(
    (m) => m.role !== 'system' && m.role !== 'tool' && !(m.role === 'assistant' && m.tool_calls)
  );

  return (
    <Stack h="calc(100vh - 68px)" p="md">
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
              <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
            </Paper>
          ))}
          {loading && (
            <Paper p="md" withBorder style={{ alignSelf: 'flex-start', maxWidth: '70%' }}>
              <Text c="dimmed">{messages.some((m) => m.tool_calls) ? 'Executing FHIR request...' : 'Thinking...'}</Text>
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
              onKeyPress={handleKeyPress}
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
