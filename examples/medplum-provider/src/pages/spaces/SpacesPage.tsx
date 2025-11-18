// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Paper, Text, Box, ScrollArea, Group, Flex, ActionIcon, Transition, CloseButton } from '@mantine/core';
import type { JSX } from 'react';
import { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useMedplum } from '@medplum/react';
import { IconHistory } from '@tabler/icons-react';
import { showErrorNotification } from '../../utils/notifications';
import { ResourceBox } from '../../components/spaces/ResourceBox';
import { ResourcePanel } from '../../components/spaces/ResourcePanel';
import type { Message } from '../../types/spaces';
import { createConversationTopic, saveMessage, loadConversationMessages } from './space-persistence';
import { ConversationList } from './ConversationList';
import { ChatInput } from './ChatInput';
import type { Identifier, Parameters } from '@medplum/fhirtypes';
import { getReferenceString } from '@medplum/core';
import classes from './SpacesPage.module.css';
import cx from 'clsx';

const fhirRequestToolsId: Identifier = {
  value: 'ai-fhir-request-tools',
  system: 'https://www.medplum.com/bots',
};

const systemPrompt = `
Be fast and concise.
You are a helpful healthcare assistant that summarizes FHIR data responses.
CRITICAL INSTRUCTIONS (ABSOLUTELY NO EXCEPTIONS):
1. YOUR ONLY OUTPUT must be a description of the FHIR response.
2. NEVER attempt to execute the FHIR request yourself or provide a mock response. The result will be provided to you by the user's environment after the response.

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
DO NOT PROVIDE JSON. 

if you get a suggestion just summarize the suggestion. Do not attempt to execute any FHIR requests.

Keep responses concise but informative.`;

export async function callAIOperation(
  medplum: any,
  messages: Message[],
  model: string,
  apiKey: string,
  onChunk?: (chunk: string) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void
): Promise<void> {

  const normalizedMessages = messages.map((msg) => {

    let content = msg.content;
    if (content === null || content === undefined) {
      content = '';
    }

    const normalizedMsg: any = {
      role: msg.role,
      content: content,
    };

    if (msg.role === 'tool' && msg.tool_call_id) {
      normalizedMsg.tool_call_id = msg.tool_call_id;
    }

    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      normalizedMsg.tool_calls = msg.tool_calls.map((toolCall) => ({
        ...toolCall,
        function: {
          ...toolCall.function,
          arguments:
            typeof toolCall.function.arguments === 'string'
              ? toolCall.function.arguments
              : JSON.stringify(toolCall.function.arguments),
        },
      }));
    }

    return normalizedMsg;
  });

  // Add system message at the beginning
  const messagesWithSystem = [{ role: 'system', content: systemPrompt }, ...normalizedMessages];

  console.log('Messages being sent to OpenAI:', JSON.stringify(messagesWithSystem, null, 2));

  const parameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'messages', valueString: JSON.stringify(messagesWithSystem) },
      { name: 'apiKey', valueString: apiKey },
      { name: 'model', valueString: model },
    ],
  };

  const fhirUrl = medplum.fhirUrl('$ai');
  const accessToken = medplum.accessToken;
  if (!accessToken) {
    throw new Error('Not authenticated. Please log in first.');
  }

  try {
    const response = await fetch(fhirUrl, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/fhir+json',
        Authorization: `Bearer ${accessToken}`,
        Connection: 'keep-alive',
      },
      credentials: 'include',
      body: JSON.stringify(parameters),
    });

    const textStream = response.body?.pipeThrough(new TextDecoderStream());
    const reader = textStream?.getReader();
    if (!reader) {
      console.error('No reader available for streaming');
      throw new Error('No reader available for streaming');
    }

    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          // Handle SSE format: `data: {...}`
          if (line.startsWith('data: ')) {
            if (line === 'data: [DONE]') {
              onComplete?.();
              continue;
            }
            try {
              const json = JSON.parse(line.slice(6)); // Remove 'data: ' prefix

              // Extract content from different possible fields
              const content =
                json.delta || // OpenAI format: delta field contains the text chunk
                json.output_text || // Alternative format
                json.text || // Another alternative
                json.content;

              if (content) {
                console.log('content', content);
                onChunk?.(content);
              }
            } catch (_e) {
              // Silently skip parse errors for non-JSON lines
            }
          } else if (line.startsWith('event: ')) {
            // Skip event type lines
            continue;
          }
        }
      }
    }
  } catch (error) {
    onError?.(error as Error);
    throw error;
  }
}

export function SpacesPage(): JSX.Element {
  const medplum = useMedplum();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-5');
  const [_apiKey, _setApiKey] = useState<string>('');
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
    setRefreshKey((prev) => prev + 1);
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

      const fhirRequestResponse = await medplum.executeBot(fhirRequestToolsId, {
        resourceType: 'Parameters',
        parameter: [
          { name: 'messages', valueString: JSON.stringify(currentMessages) },
          { name: 'model', valueString: 'gpt-5' },
        ],
      });

      const toolCallsStr = fhirRequestResponse.parameter?.find((p: any) => p.name === 'tool_calls')?.valueString;
      const allResourceRefs: string[] = [];

      // Handle tool calls if present
      if (toolCallsStr) {
        const toolCalls = JSON.parse(toolCallsStr);

        // Create assistant message with tool calls
        const assistantMessageWithToolCalls: Message = {
          role: 'assistant',
          content: '',
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
                content: JSON.stringify(result) || '',
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
      }

      // Always call AI operation for final response (whether tools were used or not)
      const assistantMessageIndex = currentMessages.length;
      let streamingContent = '';
      let hasAddedMessage = false;

      await callAIOperation(
        medplum,
        currentMessages,
        selectedModel,
        _apiKey,
        (chunk) => {
          setLoading(false);
          streamingContent += chunk;

          flushSync(() => {
            setMessages((prevMessages) => {
              const updated = [...prevMessages];
              // Add or update the message
              if (hasAddedMessage) {
                updated[assistantMessageIndex] = {
                  ...updated[assistantMessageIndex],
                  content: streamingContent,
                };
              } else {
                updated.push({
                  role: 'assistant',
                  content: streamingContent,
                });
                hasAddedMessage = true;
              }
              return updated;
            });
          });
        },
        (error) => {
          setMessages((prevMessages) => {
            const updated = [...prevMessages];
            if (hasAddedMessage) {
              updated[assistantMessageIndex] = {
                ...updated[assistantMessageIndex],
                content: `Error: ${error.message}`,
              };
            } else {
              updated.push({
                role: 'assistant',
                content: `Error: ${error.message}`,
              });
            }
            return updated;
          });
          setLoading(false);
        },
        async () => {
          // Add resources after streaming is complete
          const uniqueRefs = allResourceRefs.length > 0 ? [...new Set(allResourceRefs)] : undefined;

          if (hasAddedMessage) {
            setMessages((prevMessages) => {
              const updated = [...prevMessages];
              updated[assistantMessageIndex] = {
                ...updated[assistantMessageIndex],
                resources: uniqueRefs,
                role: 'assistant',
              };
              return updated;
            });
          }

          // Save the final assistant message with resources
          if (streamingContent && currentTopicId) {
            const finalMessage: Message = {
              role: 'assistant',
              content: streamingContent,
              resources: uniqueRefs,
            };
            await saveMessage(medplum, currentTopicId, finalMessage, assistantMessageIndex);
          }
          setLoading(false);
        }
      );
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
      <Box h="calc(100vh - 68px)" style={{ position: 'relative' }}>
        {/* Overlay Sidebar */}
        <Transition mounted={historyOpened} transition="slide-right" duration={200}>
          {(styles) => (
            <Paper
              className={classes.borderRight}
              w={320}
              h="100%"
              shadow="xl"
              style={{
                ...styles,
                position: 'absolute',
                left: 0,
                top: 0,
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Group justify="space-between" p="md" className={classes.borderBottom}>
                <Text size="lg" fw={600}>
                  Conversations
                </Text>
                <CloseButton onClick={() => setHistoryOpened(false)} />
              </Group>
              <Box style={{ flex: 1, overflow: 'hidden' }}>
                <ConversationList key={refreshKey} currentTopicId={topicId} onSelectTopic={handleSelectTopic} />
              </Box>
            </Paper>
          )}
        </Transition>

        {/* Main Content */}
        <Flex h="100%" style={{ position: 'relative' }}>
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
      </Box>
    );
  }

  // Chat layout after first message
  return (
    <Box h="calc(100vh - 68px)" style={{ position: 'relative' }}>
      {/* Overlay History Sidebar */}
      <Transition mounted={historyOpened} transition="slide-right" duration={200}>
        {(styles) => (
          <Paper
            className={classes.borderRight}
            w={320}
            h="100%"
            shadow="xl"
            style={{
              ...styles,
              position: 'absolute',
              left: 0,
              top: 0,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Group justify="space-between" p="md" className={classes.borderBottom}>
              <Text size="lg" fw={600}>
                Conversations
              </Text>
              <CloseButton onClick={() => setHistoryOpened(false)} />
            </Group>
            <Box style={{ flex: 1, overflow: 'hidden' }}>
              <ConversationList key={refreshKey} currentTopicId={topicId} onSelectTopic={handleSelectTopic} />
            </Box>
          </Paper>
        )}
      </Transition>

      {/* Main content column - chat/resource + input */}
      <Flex direction="column" h="100%">
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
                      <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content || '\u200B'}</Text>
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
    </Box>
  );
}
