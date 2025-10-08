// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, TextInput, Button, Paper, Text, Box, ScrollArea, Group } from '@mantine/core';
import type { JSX} from 'react';
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
- Patient: Patient demographics (name, birthdate, gender, address, phone)
- Practitioner: Healthcare providers
- Observation: Vital signs, lab results (blood pressure, temperature, glucose)
- Condition: Diagnoses and problems
- MedicationRequest: Prescriptions
- Appointment: Scheduled visits
- Task: Work items and to-dos
- Encounter: Patient visits
- DiagnosticReport: Lab and imaging results
- DocumentReference: Clinical documents

SEARCH EXAMPLES:
- Find by name: Patient?name=John
- Find by ID: Patient/abc-123
- Multiple params: Patient?name=John&birthdate=1990-01-01
- Search all: Patient (returns first 20)
- Phone search: Patient?telecom=555-1234

COMMON TASKS:
- "Find patient John" → GET Patient?name=John
- "Show me patient details" (after finding) → GET Patient/{id}
- "Create a task" → POST Task with body
- "Find all observations for patient X" → GET Observation?subject=Patient/{id}

Always maintain conversation context and reference previous searches or data when relevant.`,
};

export function SpacesPage(): JSX.Element {
  const medplum = useMedplum();
  const [messages, setMessages] = useState<Message[]>([SYSTEM_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const fhirTools = [
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
              description: 'HTTP method for the FHIR request',
            },
            path: {
              type: 'string',
              description: 'FHIR resource path (e.g., "Patient?name=John" or "Patient/123")',
            },
            body: {
              type: 'object',
              description: 'FHIR resource to create or update. Required for POST, PUT, and PATCH requests.',
            },
          },
          required: ['method', 'path'],
        },
      },
    },
  ];

  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages, loading]);

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
      let response = await medplum.executeBot('9bce4942-3b77-4d8c-b025-e324da963810', {
        resourceType: 'Parameters',
        parameter: [
          { name: 'messages', valueString: JSON.stringify(currentMessages) },
          { name: 'model', valueString: 'gpt-4' },
          { name: 'tools', valueString: JSON.stringify(fhirTools) },
        ],
      });

      const toolCallsStr = response.parameter?.find((p: any) => p.name === 'tool_calls')?.valueString;

      if (toolCallsStr) {
        const toolCalls = JSON.parse(toolCallsStr);

        const toolCallsForOpenAI = toolCalls.map((tc: any) => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments:
              typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments),
          },
        }));

        const assistantMessageWithToolCalls: any = {
          role: 'assistant',
          content: null,
          tool_calls: toolCallsForOpenAI,
        };
        currentMessages.push(assistantMessageWithToolCalls);

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

            const toolResult: any = {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            };
            currentMessages.push(toolResult);
          }
        }

        response = await medplum.executeBot('9bce4942-3b77-4d8c-b025-e324da963810', {
          resourceType: 'Parameters',
          parameter: [
            { name: 'messages', valueString: JSON.stringify(currentMessages) },
            { name: 'model', valueString: 'gpt-4' },
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
      handleSend().catch((error) => {
        showErrorNotification(error);
      });
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

      <ScrollArea style={{ flex: 1 }} offsetScrollbars ref={scrollAreaRef}>
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
          <TextInput
            placeholder="Ask, search, or make anything..."
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
            styles={{
              input: {
                border: 'none',
                backgroundColor: 'transparent',
                fontSize: '15px',
                padding: 0,
              },
            }}
            rightSection={
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
            }
          />
        </Paper>
      </Box>
    </Stack>
  );
}
