// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, TextInput, Button, Paper, Text, Box, ScrollArea, Group, Select, Anchor } from '@mantine/core';
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

function MessageWithLinks({ content }: { content: string }): JSX.Element {
  const resourcePattern = /\b([A-Z][a-zA-Z]+)\/([a-zA-Z0-9-]+)\b/g;

  const parts: JSX.Element[] = [];
  let lastIndex = 0;
  let match;

  while ((match = resourcePattern.exec(content)) !== null) {
    const [fullMatch, resourceType, resourceId] = match;
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {content.substring(lastIndex, matchIndex)}
        </span>
      );
    }

    const href = `/${resourceType}/${resourceId}`;
    parts.push(
      <Anchor
        key={`link-${matchIndex}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        c="#7c3aed"
        style={{ fontWeight: 500 }}
      >
        {fullMatch}
      </Anchor>
    );

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < content.length) {
    parts.push(
      <span key={`text-${lastIndex}`}>
        {content.substring(lastIndex)}
      </span>
    );
  }

  return <Text style={{ whiteSpace: 'pre-wrap' }}>{parts.length > 0 ? parts : content}</Text>;
}

const SYSTEM_MESSAGE: Message = {
  role: 'system',
  content: `
You are a **FHIR Request Translator**. Your SOLE purpose is to convert a user's healthcare request into a precise FHIR R4 tool call using the \`fhir_request\` function.

CRITICAL INSTRUCTIONS (ABSOLUTELY NO EXCEPTIONS):
1.  **YOUR ONLY OUTPUT** must be a call to the \`fhir_request\` tool or a suggetion for the user if tool call is not possible.
2.  **NEVER** generate text, explanations, narratives, or reasoning before, during, or after the tool call.
3.  **NEVER** attempt to execute the FHIR request yourself or provide a mock response. The result will be provided to you by the user's environment after the tool call.

CRITICAL INSTRUCTIONS:
- You MUST use the fhir_request tool for ALL data operations (search, read, create, update, delete)
- You CANNOT execute FHIR requests yourself - you can ONLY call the fhir_request tool
- Do NOT narrate what you're doing - just call the tool immediately
- Do NOT explain your reasoning before calling the tool
- Call the tool first, then wait for the result before responding to the user

FHIR BASICS:
FHIR (Fast Healthcare Interoperability Resources) is a standard for healthcare data exchange. Key concepts:
- Resources: Structured data types like Patient, Observation, Medication
- References: Links between resources (e.g., Patient/123)
- Search: Query resources using parameters

AVAILABLE RESOURCES:
- Patient, Practitioner, Observation, Condition, MedicationRequest, Appointment, Task, Encounter, DiagnosticReport, DocumentReference, Coverage

SEARCH EXAMPLES:
- Patient?name=John
- Patient/abc-123
- Observation?subject=Patient/123
- Task?patient=Patient/123
Use FHIR R4 syntax for all searches.

COMMON TASKS:
- "Find patient John" → Call fhir_request with GET Patient?name=John
- "Show patient details" → Call fhir_request with GET Patient/{id}
- "Create a task" → Call fhir_request with POST Task with body containing the Task resource
- "Find all observations for patient X" → Call fhir_request with GET Observation?subject=Patient/{id}
- "Update patient X" → First GET Patient/{id}, then call fhir_request with PUT Patient/{id} with the full resource

UPDATE WORKFLOW (CRITICAL):
When the user asks to update a resource:
1. First, CHECK CONTEXT for the resource to be updated.
2. If the resource is in context, immediately generate a PUT request with the modified resource body.
3. If the resource is NOT in context, first call fhir_request with GET to fetch the current resource.
Always maintain conversation context and reference previous searches or data when relevant.`,
};

const SUMMARY_SYSTEM_MESSAGE = `
You are a helpful healthcare assistant that summarizes FHIR data responses.

CRITICAL INSTRUCTIONS (ABSOLUTELY NO EXCEPTIONS):
1.  **YOUR ONLY OUTPUT** must be a description of the FHIR response.
3.  **NEVER** attempt to execute the FHIR request yourself or provide a mock response. The result will be provided to you by the user's environment after the response.


Your role is to:
1. Analyze the FHIR response data from the Medplum server
2. Present the information in a clear, human-readable format
3. Highlight key information relevant to the user's original question
4. Use plain language while maintaining medical accuracy
5. If there are multiple resources, organize them logically
6. If the response is an error, explain it clearly and suggest next steps

Format guidelines:
- Use natural language, not technical jargon unless necessary
- For patient data: present demographics, identifiers, and key attributes
- For observations: highlight values, dates, and significance
- For searches: summarize the count and key details of results
- For errors: explain what went wrong and possible solutions
- If bundle is empty, provide a message that the request was successful but there are no results and provide other suggestions.
- Just summarize the bundle, do not attempt to execute any FHIR requests.

DO NOT PROVIDE THE BUNDLE IN THE RESPONSE. JUST SUMMARIZE THE BUNDLE.
Keep responses concise but informative.
`;

const MODELS = [
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
];

const FHIR_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fhir_request',
      description:
        'REQUIRED for all FHIR operations. Make a FHIR request to the Medplum server. You MUST use this tool - you cannot execute FHIR requests yourself. For updates: first GET the resource, then PUT with the modified full resource.',
      parameters: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'DELETE'],
            description: 'HTTP method: GET for search/read, POST for create, PUT for update (requires full resource), DELETE for remove',
          },
          path: { 
            type: 'string',
            description: 'FHIR resource path, e.g., "Patient/123" or "Patient?name=John"'
          },
          body: { 
            type: 'object',
            description: 'Request body. For PUT: complete FHIR resource with all fields. For POST: full FHIR resource to create. Not used for GET/DELETE.'
          },
        },
        required: ['method', 'path'],
        additionalProperties: false,
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
                details: err.message || 'Unknown error'
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
          finalContent = `${content}\n\nResources Found:\n${uniqueRefs.map(ref => `• ${ref}`).join('\n')}`;
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
              <Text c="dimmed">
                {currentFhirRequest
                  ? `Executing ${currentFhirRequest}`
                  : 'Thinking...'}
              </Text>
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