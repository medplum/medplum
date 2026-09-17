// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { Communication, Parameters } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Message } from '../../types/spaces';
import { SpacesInbox } from './SpacesInbox';

/** HistoryList navigates through links, so the stub selects a topic directly and echoes the active topic id. */
type HistoryListProps = { currentTopicId?: string; onSelectTopic: (id: string) => void };
vi.mock('./HistoryList', () => ({
  HistoryList: ({ currentTopicId, onSelectTopic }: HistoryListProps) => (
    <button type="button" data-current-topic={currentTopicId ?? ''} onClick={() => onSelectTopic('topic-456')}>
      Select topic-456
    </button>
  ),
}));

const mockTopic: Communication = {
  resourceType: 'Communication',
  id: 'topic-123',
  status: 'in-progress',
  identifier: [
    {
      system: 'http://medplum.com/ai-message',
      value: 'ai-message-topic',
    },
  ],
  topic: {
    text: 'Test conversation',
  },
};

const mockProfile = {
  resourceType: 'Practitioner' as const,
  id: 'practitioner-123',
};

function createMockStreamingResponse(content: string): Response {
  const encoder = new TextEncoder();
  const sseData = `data: ${JSON.stringify({ content })}\n\ndata: [DONE]\n\n`;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseData));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function controlledStream(): { response: Response; push: (content: string) => void; close: () => void } {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
  return {
    response: new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    push: (content) => controller?.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`)),
    close: () => controller?.close(),
  };
}

function toCommunication(message: Message, seq: number): Communication {
  const contentString = JSON.stringify({ ...message, sequenceNumber: seq });
  return { resourceType: 'Communication', id: `msg-${seq}`, status: 'completed', payload: [{ contentString }] };
}

type ToolCall = { id?: string; function: { name: string; arguments: unknown } };

function toolCallsResponse(toolCalls: ToolCall[], visualize = false): Parameters {
  const parameter = [{ name: 'tool_calls', valueString: JSON.stringify(toolCalls) }];
  return { resourceType: 'Parameters', parameter: [...parameter, { name: 'visualize', valueBoolean: visualize }] };
}

function fhirRequestToolCall(id: string, method: string, path: string): ToolCall {
  return { id, function: { name: 'fhir_request', arguments: JSON.stringify({ method, path }) } };
}

describe('SpacesInbox', () => {
  let medplum: MockClient;
  const onNewTopicMock = vi.fn();
  const onSelectedItemMock = vi.fn((topic: Communication) => `/Spaces/Communication/${topic.id}`);
  const onAdd = vi.fn();

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    notifications.clean();

    Element.prototype.scrollTo = vi.fn();
    medplum.getProfile = vi.fn().mockResolvedValue(mockProfile) as any;
    medplum.searchResources = vi
      .fn()
      .mockImplementation((resourceType: string) => Promise.resolve(resourceType === 'Patient' ? [HomerSimpson] : []));
    medplum.searchOne = vi.fn().mockResolvedValue({ resourceType: 'Bot', id: 'bot-123' });
    medplum.getAccessToken = vi.fn().mockReturnValue('mock-token');
    medplum.fhirUrl = vi.fn().mockReturnValue(new URL('https://api.medplum.com/fhir/R4/Bot/bot-123/$execute'));
    medplum.readReference = vi.fn().mockImplementation((ref: any) => {
      if (ref.reference?.startsWith('Communication/')) {
        return Promise.resolve(mockTopic);
      }
      const [resourceType, id] = ref.reference?.split('/') || [];
      return Promise.resolve({ resourceType, id, meta: {} } as any);
    });
    medplum.createResource = vi.fn().mockImplementation((resource: any) => {
      if (resource.identifier?.[0]?.value === 'ai-message-topic') {
        return Promise.resolve(mockTopic);
      }
      return Promise.resolve({ ...resource, id: 'message-123' } as Communication);
    });
  });

  const setup = (topic?: { reference: string }): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <SpacesInbox topic={topic} onNewTopic={onNewTopicMock} onSelectedItem={onSelectedItemMock} onAdd={onAdd} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  const panelHeader = (title: string): HTMLElement =>
    screen.getByText(title).closest('div')?.parentElement as HTMLElement;

  const closePanel = (user: UserEvent, title: string): Promise<void> =>
    user.click(panelHeader(title).querySelector('.mantine-CloseButton-root') as HTMLElement);

  const goBackFromDetails = (user: UserEvent): Promise<void> =>
    user.click(panelHeader('Resource Details').querySelector('button') as HTMLElement);

  const mockConversation = (messages: Message[]): void => {
    const comms = messages.map(toCommunication);
    medplum.searchResources = vi
      .fn()
      .mockImplementation(async (t: string) => (t === 'Patient' ? [HomerSimpson] : comms));
  };

  describe('Initial state (before first message)', () => {
    test('renders the initial state with How can I help you today? heading', async () => {
      await act(async () => {
        setup();
      });

      expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Ask, search, or make anything...')).toBeInTheDocument();
    });

    test('shows history button', async () => {
      await act(async () => {
        setup();
      });

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    test('conversation list is in the DOM but hidden', async () => {
      await act(async () => {
        setup();
      });

      expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
    });
  });

  describe('Sidebar', () => {
    test('toggles the conversations sidebar and forwards the New conversation click', async () => {
      const user = userEvent.setup();
      setup();
      const sidebar = screen.getByText('Conversations').parentElement?.parentElement as HTMLElement;
      expect(sidebar).toHaveStyle({ width: '0px' });
      const header = screen.getByLabelText('New conversation').parentElement as HTMLElement;
      await user.click(header.querySelector('button') as HTMLButtonElement);
      expect(sidebar).toHaveStyle({ width: '280px' });
      await user.click(screen.getByLabelText('New conversation'));
      expect(onAdd).toHaveBeenCalledTimes(1);
      await user.click(screen.getByText('Conversations').parentElement?.querySelector('button') as HTMLElement);
      expect(sidebar).toHaveStyle({ width: '0px' });
    });

    test('reports a failed history load, then loads the selected conversation', async () => {
      const user = userEvent.setup();
      medplum.searchResources = vi.fn().mockRejectedValue(new Error('History unavailable'));
      setup();
      await user.click(screen.getByText('Select topic-456'));
      expect(await screen.findByText('History unavailable')).toBeInTheDocument();
      mockConversation([{ role: 'user', content: 'Earlier question' }]);
      await user.click(screen.getByText('Select topic-456'));
      expect(await screen.findByText('Earlier question')).toBeInTheDocument();
      expect(screen.queryByText('How can I help you today?')).not.toBeInTheDocument();
      expect(screen.getByText('Select topic-456')).toHaveAttribute('data-current-topic', 'topic-456');
    });
  });

  describe('Loading a topic', () => {
    const toolCallMessages: Message[] = [
      { role: 'system', content: 'hidden system prompt' },
      { role: 'user', content: 'Look things up' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          fhirRequestToolCall('tc-get', 'GET', 'Patient/patient-1'),
          { id: 'tc-broken', function: { name: 'fhir_request', arguments: 'not json' } },
          { function: { name: 'custom_tool', arguments: { foo: 'bar' } } },
        ],
      },
      { role: 'tool', tool_call_id: 'tc-get', content: JSON.stringify({ resourceType: 'Patient', id: 'patient-1' }) },
    ];

    test('loads persisted messages, hides system messages, and renders tool calls with toggleable responses', async () => {
      const user = userEvent.setup();
      mockConversation(toolCallMessages);
      setup({ reference: 'Communication/topic-123' });
      expect(await screen.findByText('Look things up')).toBeInTheDocument();
      expect(screen.queryByText('hidden system prompt')).not.toBeInTheDocument();
      expect(screen.getByText('Select topic-456')).toHaveAttribute('data-current-topic', 'topic-123');
      expect(screen.getByText('GET')).toBeInTheDocument();
      expect(screen.getByText('CALL')).toBeInTheDocument();
      expect(screen.getByText('Unable to parse tool call')).toBeInTheDocument();
      await user.click(screen.getByText('Response'));
      expect(screen.getByText(/"resourceType": "Patient"/)).toBeInTheDocument();
      expect(screen.getByText('▲')).toBeInTheDocument();
      await user.click(screen.getByText('Response'));
      expect(screen.getByText('▼')).toBeInTheDocument();
    });

    test('opens the results list, drills into a result, navigates back, and closes each panel', async () => {
      const user = userEvent.setup();
      const resources = ['Patient/p-1', 'Patient/p-2', 'Patient/p-3'];
      mockConversation([{ role: 'assistant', content: 'Found three', resources }]);
      setup({ reference: 'Communication/topic-123' });
      await user.click(await screen.findByText('3 results'));
      expect(screen.getByText('Results (3)')).toBeInTheDocument();
      await user.click((await screen.findAllByTestId('resource-box'))[1]);
      expect(screen.getByText('Resource Details')).toBeInTheDocument();
      await goBackFromDetails(user);
      expect(screen.getByText('Results (3)')).toBeInTheDocument();
      await closePanel(user, 'Results (3)');
      expect(screen.queryByText('Results (3)')).not.toBeInTheDocument();
    });

    test('opens a persisted component, drills into one of its resources, returns, and closes', async () => {
      const user = userEvent.setup();
      const componentCode = 'function Widget() {\n  return <Text>Widget rendered</Text>;\n}';
      mockConversation([{ role: 'assistant', content: 'Here you go', componentCode, resources: ['Patient/p-1'] }]);
      setup({ reference: 'Communication/topic-123' });
      await user.click(await screen.findByText('View Component'));
      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Resources' }));
      await user.click(await screen.findByTestId('resource-box'));
      expect(screen.getByText('Resource Details')).toBeInTheDocument();
      await goBackFromDetails(user);
      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      await closePanel(user, 'Component Preview');
      expect(screen.queryByText('Component Preview')).not.toBeInTheDocument();
    });

    test('shows an error notification when loading the topic fails', async () => {
      medplum.searchResources = vi.fn().mockRejectedValue(new Error('Load failed'));
      setup({ reference: 'Communication/topic-123' });
      expect(await screen.findByText('Load failed')).toBeInTheDocument();
      expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
    });

    test('shows a scroll-to-bottom button when scrolled up and scrolls down on click', async () => {
      const user = userEvent.setup();
      mockConversation([{ role: 'user', content: 'Persisted question' }]);
      setup({ reference: 'Communication/topic-123' });
      await screen.findByText('Persisted question');
      const viewport = document.querySelector('.mantine-ScrollArea-viewport') as HTMLElement;
      Object.defineProperties(viewport, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
      fireEvent.scroll(viewport);
      await user.click(screen.getByLabelText('Scroll to bottom'));
      expect(Element.prototype.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' });
      expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();
    });
  });

  describe('Sending messages', () => {
    test('sends a message and creates a new conversation topic', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockResolvedValue({
        resourceType: 'Parameters',
        parameter: [{ name: 'content', valueString: 'Bot response' }],
      });

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');

      await user.type(input, 'Hello AI');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(medplum.executeBot).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(onNewTopicMock).toHaveBeenCalledWith(mockTopic);
      });
    });

    test('does not send empty messages', async () => {
      await act(async () => {
        setup();
      });

      expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start voice mode' })).toBeInTheDocument();
      expect(medplum.createResource).not.toHaveBeenCalled();
    });

    test('handles Enter key to send message', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockResolvedValue({
        resourceType: 'Parameters',
        parameter: [{ name: 'content', valueString: 'Bot response' }],
      });

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');

      await user.click(input);
      await user.keyboard('{Enter}');
      expect(medplum.createResource).not.toHaveBeenCalled();

      await user.type(input, 'Hello AI');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalled();
      });
    });

    test('sends selected patients as context and shows them above the message', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockResolvedValue({
        resourceType: 'Parameters',
        parameter: [{ name: 'content', valueString: 'About Homer' }],
      });
      setup();
      await user.click(screen.getByRole('button', { name: 'Patients' }));
      await user.click(await screen.findByText('Homer Simpson', {}, { timeout: 3000 }));
      await user.type(screen.getByPlaceholderText('Ask, search, or make anything...'), 'Summarize');
      await user.click(screen.getByRole('button', { name: 'Send message' }));
      expect(await screen.findByText('About Homer')).toBeInTheDocument();
      const userMessage = screen.getByText('Summarize').parentElement?.parentElement as HTMLElement;
      expect(within(userMessage).getByText('Homer Simpson')).toBeInTheDocument();
    });
  });

  describe('Chat state (after first message)', () => {
    test('displays user and assistant messages', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockResolvedValue({
        resourceType: 'Parameters',
        parameter: [{ name: 'content', valueString: 'Hello! How can I help you?' }],
      });

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');

      await user.type(input, 'Hello AI');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => {
        expect(screen.getByText('Hello AI')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
      });
    });
  });

  describe('Tool calls and FHIR requests', () => {
    test('handles fhir_request tool calls', async () => {
      const user = userEvent.setup();
      const mockPatient = { resourceType: 'Patient', id: 'patient-123', name: [{ given: ['John'], family: 'Doe' }] };

      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce(toolCallsResponse([fhirRequestToolCall('tool-1', 'GET', 'Patient/patient-123')]))
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [],
        });

      medplum.get = vi.fn().mockResolvedValue(mockPatient);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Found patient John Doe'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      await user.type(input, 'Get patient 123');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(
        () => {
          expect(medplum.get).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      await waitFor(() => {
        expect(screen.getByText('Found patient John Doe')).toBeInTheDocument();
      });
    });

    test('handles FHIR request errors', async () => {
      const user = userEvent.setup();

      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce(toolCallsResponse([fhirRequestToolCall('tool-1', 'GET', 'Patient/nonexistent')]))
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [],
        });

      medplum.get = vi.fn().mockRejectedValue(new Error('Not found'));
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Patient not found'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');

      await user.type(input, 'Get nonexistent patient');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => {
        expect(medplum.get).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });
    });
  });

  describe('Component generation', () => {
    test('streams the generated component into the preview panel and keeps it as a card', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce(toolCallsResponse([fhirRequestToolCall('tool-1', 'GET', 'Patient/patient-123')], true))
        .mockResolvedValueOnce({ resourceType: 'Parameters', parameter: [] });
      medplum.get = vi.fn().mockResolvedValue({ resourceType: 'Patient', id: 'patient-123' });
      medplum.readResource = vi.fn().mockResolvedValue({ resourceType: 'Patient', id: 'patient-123' });
      const componentStream = controlledStream();
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(createMockStreamingResponse('Here is your chart'))
        .mockResolvedValueOnce(componentStream.response);
      setup();
      await user.type(screen.getByPlaceholderText('Ask, search, or make anything...'), 'Chart patients');
      await user.click(screen.getByRole('button', { name: 'Send message' }));
      const generating = await screen.findByText('Generating component...', {}, { timeout: 3000 });
      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      await closePanel(user, 'Component Preview');
      expect(screen.queryByText('Component Preview')).not.toBeInTheDocument();
      await user.click(generating);
      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      await act(async () =>
        componentStream.push('```jsx\nfunction Chart() {\n  return <Text>Generated chart</Text>;\n}\n```')
      );
      expect(await screen.findByText(/function Chart/)).toBeInTheDocument();
      await act(async () => componentStream.close());
      expect(await screen.findByText('View Component')).toBeInTheDocument();
      expect(screen.getByText('Here is your chart')).toBeInTheDocument();
      expect(screen.queryByText('Generating component...')).not.toBeInTheDocument();
    });
  });

  describe('Resource display', () => {
    test('displays resource boxes when resources are returned', async () => {
      const user = userEvent.setup();

      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce(toolCallsResponse([fhirRequestToolCall('tool-1', 'GET', 'Patient/patient-123')]))
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [],
        });

      medplum.get = vi.fn().mockResolvedValue({
        resourceType: 'Patient',
        id: 'patient-123',
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Found patient'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');

      await user.type(input, 'Get patient');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => {
        expect(screen.getByTestId('resource-box')).toBeInTheDocument();
      });

      await waitFor(() => {
        const resourceBox = screen.getByTestId('resource-box');
        expect(within(resourceBox).getByText('Patient/patient-123')).toBeInTheDocument();
      });
    });

    test('opens resource panel when clicking on resource box', async () => {
      const user = userEvent.setup();

      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce(toolCallsResponse([fhirRequestToolCall('tool-1', 'GET', 'Patient/patient-123')]))
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [],
        });

      medplum.get = vi.fn().mockResolvedValue({
        resourceType: 'Patient',
        id: 'patient-123',
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Found patient'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');

      await user.type(input, 'Get patient');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => {
        expect(screen.getByTestId('resource-box')).toBeInTheDocument();
      });

      const resourceBox = screen.getByTestId('resource-box');
      await user.click(resourceBox);

      await waitFor(() => {
        expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
        expect(screen.getByText('Resource Details')).toBeInTheDocument();
      });
    });

    test('closes resource panel when clicking close button', async () => {
      const user = userEvent.setup();

      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce(toolCallsResponse([fhirRequestToolCall('tool-1', 'GET', 'Patient/patient-123')]))
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [],
        });

      medplum.get = vi.fn().mockResolvedValue({
        resourceType: 'Patient',
        id: 'patient-123',
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Found patient'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');

      await user.type(input, 'Get patient');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => {
        expect(screen.getByTestId('resource-box')).toBeInTheDocument();
      });

      const resourceBox = screen.getByTestId('resource-box');
      await user.click(resourceBox);

      await waitFor(() => {
        expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
      });

      const allButtons = screen.getAllByRole('button');
      const closeButton = allButtons.find((btn) => btn.className.includes('CloseButton'));
      if (!closeButton) {
        throw new Error('CloseButton not found');
      }

      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('resource-panel')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    test('displays error message when bot execution fails', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockRejectedValue(new Error('Bot execution failed'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');

      await user.type(input, 'Hello AI');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => {
        expect(screen.getByText(/Error: Bot execution failed/)).toBeInTheDocument();
      });
    });
  });

  describe('HTTP method support', () => {
    test.each([
      ['GET', 'get'],
      ['POST', 'post'],
      ['PUT', 'put'],
      ['DELETE', 'delete'],
    ])('handles %s requests', async (method, clientMethod) => {
      const user = userEvent.setup();

      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'tool_calls',
              valueString: JSON.stringify([
                {
                  id: 'tool-1',
                  function: {
                    name: 'fhir_request',
                    arguments: JSON.stringify({
                      method,
                      path: 'Patient/patient-123',
                      body: method !== 'GET' && method !== 'DELETE' ? { resourceType: 'Patient' } : undefined,
                    }),
                  },
                },
              ]),
            },
          ],
        })
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [{ name: 'content', valueString: 'Success' }],
        });

      (medplum as any)[clientMethod] = vi.fn().mockResolvedValue({ resourceType: 'Patient', id: 'patient-123' });

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');

      await user.type(input, `${method} patient`);
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => {
        expect((medplum as any)[clientMethod]).toHaveBeenCalled();
      });
    });
  });

  describe('Bundle handling', () => {
    test('extracts resource references from Bundle entries', async () => {
      const user = userEvent.setup();
      const mockBundle = {
        resourceType: 'Bundle',
        entry: [
          { resource: { resourceType: 'Patient', id: 'patient-1' } },
          { resource: { resourceType: 'Patient', id: 'patient-2' } },
        ],
      };

      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce(toolCallsResponse([fhirRequestToolCall('tool-1', 'GET', 'Patient?name=John')]))
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [],
        });

      medplum.get = vi.fn().mockResolvedValue(mockBundle);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Found 2 patients'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');

      await user.type(input, 'Search patients');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => {
        expect(medplum.get).toHaveBeenCalled();
      });

      await waitFor(() => {
        const resourceBoxes = screen.getAllByTestId('resource-box');
        expect(resourceBoxes.length).toBe(2);
      });
    });
  });
});
