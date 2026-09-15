// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { Communication, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Message } from '../../types/spaces';
import { SpacesInbox } from './SpacesInbox';

/**
 * HistoryList never invokes onSelectTopic itself (it navigates through links), so the real
 * component cannot reach SpacesInbox.handleSelectTopic. The stub exposes a button per topic id
 * that calls the callback directly and echoes the active topic id for assertions.
 */
vi.mock('./HistoryList', () => ({
  HistoryList: ({
    currentTopicId,
    onSelectTopic,
  }: {
    currentTopicId?: string;
    onSelectTopic: (id: string) => void;
  }) => (
    <div data-testid="history-list" data-current-topic={currentTopicId ?? ''}>
      <button type="button" onClick={() => onSelectTopic('topic-456')}>
        Select topic-456
      </button>
    </div>
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

const mockPatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-777',
  name: [{ given: ['Lisa'], family: 'Simpson' }],
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

interface ControlledStream {
  response: Response;
  push: (content: string) => void;
  close: () => void;
}

/**
 * A streaming response whose chunks are emitted on demand, so a test can observe the UI
 * while the stream is still open.
 * @returns The response plus push/close controls for the underlying stream.
 */
function createControlledStreamingResponse(): ControlledStream {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    push: (content: string) => controller?.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)),
    close: () => {
      controller?.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller?.close();
    },
  };
}

/**
 * Persisted form of a chat message, as loadConversationMessages expects to find it.
 * @param topicId - The conversation topic the message belongs to.
 * @param message - The chat message to persist.
 * @param sequenceNumber - Position of the message in the conversation.
 * @returns The Communication resource holding the message payload.
 */
function toCommunication(topicId: string, message: Message, sequenceNumber: number): Communication {
  return {
    resourceType: 'Communication',
    id: `msg-${sequenceNumber}`,
    status: 'completed',
    identifier: [{ system: 'http://medplum.com/ai-message', value: 'ai-message' }],
    partOf: [{ reference: `Communication/${topicId}` }],
    payload: [{ contentString: JSON.stringify({ ...message, sequenceNumber }) }],
  };
}

function toolCallsResponse(toolCalls: unknown[], visualize?: boolean): Record<string, unknown> {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'tool_calls', valueString: JSON.stringify(toolCalls) },
      ...(visualize ? [{ name: 'visualize', valueBoolean: true }] : []),
    ],
  };
}

function fhirRequestToolCall(id: string, method: string, path: string): unknown {
  return { id, function: { name: 'fhir_request', arguments: JSON.stringify({ method, path }) } };
}

describe('SpacesInbox', () => {
  let medplum: MockClient;
  const onNewTopicMock = vi.fn();
  const onSelectedItemMock = vi.fn((topic: Communication) => `/Spaces/Communication/${topic.id}`);

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();

    Element.prototype.scrollTo = vi.fn();
    medplum.getProfile = vi.fn().mockResolvedValue(mockProfile) as any;
    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      return Promise.resolve(resourceType === 'Patient' ? [mockPatient] : []);
    });
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

  afterEach(() => {
    notifications.clean();
    vi.restoreAllMocks();
  });

  const setup = (topicRef?: { reference: string }, onAdd?: () => void): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <SpacesInbox
              topic={topicRef}
              onNewTopic={onNewTopicMock}
              onSelectedItem={onSelectedItemMock}
              onAdd={onAdd}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  /**
   * Mirrors the page: the topic prop follows onNewTopic, so it changes mid-send.
   * @returns The inbox bound to a stateful topic.
   */
  function TopicHarness(): JSX.Element {
    const [topic, setTopic] = useState<Communication | undefined>();
    return (
      <SpacesInbox
        topic={topic}
        onNewTopic={(t) => {
          onNewTopicMock(t);
          setTopic(t);
        }}
        onSelectedItem={onSelectedItemMock}
      />
    );
  }

  /**
   * Clicks the CloseButton in the side-panel header that carries the given title.
   * @param user - The user-event instance driving the test.
   * @param title - Header title of the panel to close.
   */
  const closePanel = async (user: ReturnType<typeof userEvent.setup>, title: string): Promise<void> => {
    const header = screen.getByText(title).closest('div')?.parentElement as HTMLElement;
    await user.click(header.querySelector('.mantine-CloseButton-root') as HTMLElement);
  };

  const mockConversation = (messages: Message[]): void => {
    const comms = messages.map((m, i) => toCommunication('topic-123', m, i));
    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'Patient') {
        return Promise.resolve([mockPatient]);
      }
      return Promise.resolve(comms);
    });
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

    test('shows the New conversation button only when onAdd is provided', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      const { unmount } = setup();
      expect(screen.queryByLabelText('New conversation')).not.toBeInTheDocument();
      unmount();

      setup(undefined, onAdd);
      await user.click(screen.getByLabelText('New conversation'));
      expect(onAdd).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sidebar', () => {
    test('opens and closes the conversations sidebar', async () => {
      const user = userEvent.setup();
      setup(undefined, vi.fn());

      const sidebar = screen.getByText('Conversations').parentElement?.parentElement as HTMLElement;
      expect(sidebar).toHaveStyle({ width: '0px' });

      const header = screen.getByLabelText('New conversation').parentElement as HTMLElement;
      const expandButton = header.querySelector('button') as HTMLButtonElement;
      await user.click(expandButton);
      expect(sidebar).toHaveStyle({ width: '280px' });
      expect(header.querySelectorAll('button')).toHaveLength(1);

      const collapseButton = screen.getByText('Conversations').parentElement?.querySelector('button') as HTMLElement;
      await user.click(collapseButton);
      expect(sidebar).toHaveStyle({ width: '0px' });
    });

    test('loads the selected conversation from the history list', async () => {
      const user = userEvent.setup();
      mockConversation([
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' },
      ]);
      setup();

      await user.click(screen.getByText('Select topic-456'));

      expect(await screen.findByText('Earlier question')).toBeInTheDocument();
      expect(screen.getByText('Earlier answer')).toBeInTheDocument();
      expect(screen.queryByText('How can I help you today?')).not.toBeInTheDocument();
      expect(screen.getByTestId('history-list')).toHaveAttribute('data-current-topic', 'topic-456');
      expect(medplum.searchResources).toHaveBeenCalledWith(
        'Communication',
        expect.objectContaining({ 'part-of': 'Communication/topic-456' })
      );
    });

    test('shows an error notification when the selected conversation fails to load', async () => {
      const user = userEvent.setup();
      medplum.searchResources = vi.fn().mockRejectedValue(new Error('History unavailable'));
      setup();

      await user.click(screen.getByText('Select topic-456'));

      expect(await screen.findByText('History unavailable')).toBeInTheDocument();
      expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
    });
  });

  describe('Loading a topic', () => {
    test('loads persisted messages and skips system messages', async () => {
      mockConversation([
        { role: 'system', content: 'hidden system prompt' },
        { role: 'user', content: 'Persisted question' },
        { role: 'assistant', content: 'Persisted answer' },
      ]);

      setup({ reference: 'Communication/topic-123' });

      expect(await screen.findByText('Persisted question')).toBeInTheDocument();
      expect(screen.getByText('Persisted answer')).toBeInTheDocument();
      expect(screen.queryByText('hidden system prompt')).not.toBeInTheDocument();
      expect(screen.getByTestId('history-list')).toHaveAttribute('data-current-topic', 'topic-123');
      expect(medplum.searchResources).toHaveBeenCalledWith(
        'Communication',
        expect.objectContaining({ 'part-of': 'Communication/topic-123' })
      );
    });

    test('scrolls to the bottom again shortly after loading finishes', async () => {
      mockConversation([{ role: 'user', content: 'Persisted question' }]);
      setup({ reference: 'Communication/topic-123' });
      await screen.findByText('Persisted question');

      const scrollTo = vi.mocked(Element.prototype.scrollTo);
      const callsAfterLoad = scrollTo.mock.calls.length;

      await waitFor(() => {
        expect(scrollTo.mock.calls.length).toBeGreaterThan(callsAfterLoad);
      });
    });

    test('shows an error notification when loading the topic fails', async () => {
      medplum.searchResources = vi.fn().mockRejectedValue(new Error('Load failed'));

      setup({ reference: 'Communication/topic-123' });

      expect(await screen.findByText('Load failed')).toBeInTheDocument();
      expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
    });

    test('does not reload the conversation when the topic changes during a send', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  resourceType: 'Parameters',
                  parameter: [{ name: 'content', valueString: 'Bot response' }],
                }),
              50
            );
          })
      );

      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <TopicHarness />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );

      await user.type(screen.getByPlaceholderText('Ask, search, or make anything...'), 'Hello AI');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(await screen.findByText('Bot response')).toBeInTheDocument();
      expect(onNewTopicMock).toHaveBeenCalledWith(mockTopic);
      expect(screen.getByText('Hello AI')).toBeInTheDocument();
      expect(medplum.searchResources).not.toHaveBeenCalledWith('Communication', expect.anything());
    });
  });

  describe('Tool call rendering', () => {
    const toolCallMessages: Message[] = [
      { role: 'user', content: 'Look things up' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          fhirRequestToolCall('tc-get', 'GET', 'Patient/patient-1'),
          fhirRequestToolCall('tc-post', 'POST', 'Observation'),
          fhirRequestToolCall('tc-put', 'PUT', 'Patient/patient-1'),
          fhirRequestToolCall('tc-delete', 'DELETE', 'Patient/patient-2'),
          { id: 'tc-broken', function: { name: 'fhir_request', arguments: 'not json' } },
          { function: { name: 'custom_tool', arguments: { foo: 'bar' } } },
        ],
      },
      { role: 'tool', tool_call_id: 'tc-get', content: JSON.stringify({ resourceType: 'Patient', id: 'patient-1' }) },
      { role: 'tool', tool_call_id: 'tc-post', content: 'plain text response' },
    ];

    test('renders each request with its method badge and path', async () => {
      mockConversation(toolCallMessages);
      setup({ reference: 'Communication/topic-123' });

      expect(await screen.findByText('GET')).toBeInTheDocument();
      expect(screen.getByText('POST')).toBeInTheDocument();
      expect(screen.getByText('PUT')).toBeInTheDocument();
      expect(screen.getByText('DELETE')).toBeInTheDocument();
      expect(screen.getByText('CALL')).toBeInTheDocument();
      expect(screen.getByText('custom_tool')).toBeInTheDocument();
      expect(screen.getByText('Observation')).toBeInTheDocument();
      expect(screen.getByText('Unable to parse tool call')).toBeInTheDocument();
      expect(screen.getAllByText('Response')).toHaveLength(2);
    });

    test('expands and collapses a tool response', async () => {
      const user = userEvent.setup();
      mockConversation(toolCallMessages);
      setup({ reference: 'Communication/topic-123' });

      const [getResponse, postResponse] = await screen.findAllByText('Response');
      expect(screen.getAllByText('▼')).toHaveLength(2);

      await user.click(getResponse);
      expect(screen.getByText('▲')).toBeInTheDocument();
      expect(screen.getByText(/"resourceType": "Patient"/)).toBeInTheDocument();

      await user.click(postResponse);
      expect(screen.getAllByText('▲')).toHaveLength(2);
      expect(screen.getByText('plain text response')).toBeInTheDocument();

      await user.click(getResponse);
      expect(screen.getAllByText('▲')).toHaveLength(1);
      expect(screen.getAllByText('▼')).toHaveLength(1);
    });
  });

  describe('Results panel', () => {
    const manyResults: Message[] = [
      { role: 'user', content: 'Find patients' },
      { role: 'assistant', content: 'Found three', resources: ['Patient/p-1', 'Patient/p-2', 'Patient/p-3'] },
    ];

    test('collapses more than two resources into a results card that opens the results panel', async () => {
      const user = userEvent.setup();
      mockConversation(manyResults);
      setup({ reference: 'Communication/topic-123' });

      await user.click(await screen.findByText('3 results'));

      expect(screen.getByText('Results (3)')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getAllByTestId('resource-box')).toHaveLength(3);
      });
    });

    test('drills into a result and navigates back to the list', async () => {
      const user = userEvent.setup();
      mockConversation(manyResults);
      setup({ reference: 'Communication/topic-123' });

      await user.click(await screen.findByText('3 results'));
      const boxes = await screen.findAllByTestId('resource-box');
      await user.click(boxes[1]);

      expect(screen.getByText('Resource Details')).toBeInTheDocument();
      expect(screen.queryByText('Results (3)')).not.toBeInTheDocument();

      const header = screen.getByText('Resource Details').closest('div')?.parentElement as HTMLElement;
      await user.click(header.querySelector('button') as HTMLElement);

      expect(screen.getByText('Results (3)')).toBeInTheDocument();
      expect(screen.queryByText('Resource Details')).not.toBeInTheDocument();
    });

    test('closes the results panel', async () => {
      const user = userEvent.setup();
      mockConversation(manyResults);
      setup({ reference: 'Communication/topic-123' });

      await user.click(await screen.findByText('3 results'));
      await closePanel(user, 'Results (3)');

      expect(screen.queryByText('Results (3)')).not.toBeInTheDocument();
    });

    test('closing the resource details also clears the results list', async () => {
      const user = userEvent.setup();
      mockConversation(manyResults);
      setup({ reference: 'Communication/topic-123' });

      await user.click(await screen.findByText('3 results'));
      const boxes = await screen.findAllByTestId('resource-box');
      await user.click(boxes[0]);
      await closePanel(user, 'Resource Details');

      expect(screen.queryByText('Resource Details')).not.toBeInTheDocument();
      expect(screen.queryByText('Results (3)')).not.toBeInTheDocument();
    });
  });

  describe('Component preview panel', () => {
    const componentCode = 'function Widget() {\n  return <Text>Widget rendered</Text>;\n}';

    test('opens a persisted component in the preview panel and closes it', async () => {
      const user = userEvent.setup();
      mockConversation([
        { role: 'user', content: 'Chart it' },
        { role: 'assistant', content: 'Here you go', componentCode, resources: ['Patient/p-1'] },
      ]);
      setup({ reference: 'Communication/topic-123' });

      await user.click(await screen.findByText('View Component'));

      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Resources' })).toBeInTheDocument();

      await closePanel(user, 'Component Preview');
      expect(screen.queryByText('Component Preview')).not.toBeInTheDocument();
    });

    test('opens a resource from the component preview and returns to the preview', async () => {
      const user = userEvent.setup();
      mockConversation([
        { role: 'user', content: 'Chart it' },
        { role: 'assistant', content: 'Here you go', componentCode, resources: ['Patient/p-1'] },
      ]);
      setup({ reference: 'Communication/topic-123' });

      await user.click(await screen.findByText('View Component'));
      await user.click(screen.getByRole('tab', { name: 'Resources' }));
      await user.click(await screen.findByTestId('resource-box'));

      expect(screen.getByText('Resource Details')).toBeInTheDocument();
      expect(screen.queryByText('Component Preview')).not.toBeInTheDocument();

      const header = screen.getByText('Resource Details').closest('div')?.parentElement as HTMLElement;
      await user.click(header.querySelector('button') as HTMLElement);

      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      expect(screen.queryByText('Resource Details')).not.toBeInTheDocument();
    });
  });

  describe('Scroll tracking', () => {
    function getViewport(): HTMLElement {
      return document.querySelector('.mantine-ScrollArea-viewport') as HTMLElement;
    }

    function setScrollMetrics(viewport: HTMLElement, scrollTop: number): void {
      Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1000 });
      Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 300 });
      Object.defineProperty(viewport, 'scrollTop', { configurable: true, value: scrollTop, writable: true });
    }

    test('shows a scroll-to-bottom button when scrolled up and hides it when back at the bottom', async () => {
      mockConversation([{ role: 'user', content: 'Persisted question' }]);
      setup({ reference: 'Communication/topic-123' });
      await screen.findByText('Persisted question');

      const viewport = getViewport();
      setScrollMetrics(viewport, 0);
      fireEvent.scroll(viewport);
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();

      setScrollMetrics(viewport, 700);
      fireEvent.scroll(viewport);
      expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();
    });

    test('clicking scroll-to-bottom smooth-scrolls the viewport and hides the button', async () => {
      const user = userEvent.setup();
      mockConversation([{ role: 'user', content: 'Persisted question' }]);
      setup({ reference: 'Communication/topic-123' });
      await screen.findByText('Persisted question');

      const viewport = getViewport();
      setScrollMetrics(viewport, 0);
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

    test('ignores Enter when the input is empty', async () => {
      const user = userEvent.setup();
      setup();

      await user.click(screen.getByPlaceholderText('Ask, search, or make anything...'));
      await user.keyboard('{Enter}');

      expect(medplum.createResource).not.toHaveBeenCalled();
      expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
    });

    test('ignores a second send while a message is in flight', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockImplementation(() => new Promise(() => {}));
      setup();

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      await user.type(input, 'First');
      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(medplum.executeBot).toHaveBeenCalledTimes(1);
      });
      expect(screen.getByText('Thinking...')).toBeInTheDocument();

      await user.type(input, 'Second');
      await user.keyboard('{Enter}');

      expect(medplum.executeBot).toHaveBeenCalledTimes(1);
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.queryByText('Second', { ignore: 'textarea' })).not.toBeInTheDocument();
      expect(input).toHaveValue('Second');
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

      await user.type(input, 'Hello AI');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalled();
      });
    });

    test('Shift+Enter inserts a newline instead of sending', async () => {
      const user = userEvent.setup();
      setup();

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      await user.type(input, 'Line one');
      await user.keyboard('{Shift>}{Enter}{/Shift}');

      expect(medplum.createResource).not.toHaveBeenCalled();
      expect(input).toHaveValue('Line one\n');
    });

    test('sends selected patients as context and shows them above the message', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockResolvedValue({
        resourceType: 'Parameters',
        parameter: [{ name: 'content', valueString: 'About Lisa' }],
      });
      setup();

      await user.click(screen.getByRole('button', { name: 'Patients' }));
      await user.click(await screen.findByText('Lisa Simpson', {}, { timeout: 3000 }));
      expect(screen.getByLabelText('Remove Lisa Simpson')).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText('Ask, search, or make anything...'), 'Summarize');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(await screen.findByText('About Lisa')).toBeInTheDocument();
      const userMessage = screen.getByText('Summarize').parentElement?.parentElement as HTMLElement;
      expect(within(userMessage).getByText('Lisa Simpson')).toBeInTheDocument();
      expect(medplum.executeBot).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          parameter: expect.arrayContaining([
            expect.objectContaining({
              name: 'messages',
              valueString: expect.stringContaining('Patient/patient-777'),
            }),
          ]),
        })
      );
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

    test('shows the executing indicator while a FHIR request runs', async () => {
      const user = userEvent.setup();
      let resolveGet: ((value: unknown) => void) | undefined;
      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce(toolCallsResponse([fhirRequestToolCall('tool-1', 'GET', 'Patient/patient-123')]))
        .mockResolvedValueOnce({ resourceType: 'Parameters', parameter: [] });
      medplum.get = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveGet = resolve;
          })
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Done'));
      setup();

      await user.type(screen.getByPlaceholderText('Ask, search, or make anything...'), 'Get patient');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(await screen.findByText('Executing Step 1: GET Patient/patient-123...')).toBeInTheDocument();

      await act(async () => {
        resolveGet?.({ resourceType: 'Patient', id: 'patient-123' });
      });

      expect(await screen.findByText('Done')).toBeInTheDocument();
      expect(screen.queryByText(/Executing/)).not.toBeInTheDocument();
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
    const componentMarkdown = '```jsx\nfunction Chart() {\n  return <Text>Generated chart</Text>;\n}\n```';

    function mockVisualizeFlow(): void {
      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce(toolCallsResponse([fhirRequestToolCall('tool-1', 'GET', 'Patient/patient-123')], true))
        .mockResolvedValueOnce({ resourceType: 'Parameters', parameter: [] });
      medplum.get = vi.fn().mockResolvedValue({ resourceType: 'Patient', id: 'patient-123' });
      medplum.readResource = vi.fn().mockResolvedValue({ resourceType: 'Patient', id: 'patient-123' });
    }

    test('streams the generated component into the preview panel and keeps it as a card', async () => {
      const user = userEvent.setup();
      mockVisualizeFlow();
      const componentStream = createControlledStreamingResponse();
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(createMockStreamingResponse('Here is your chart'))
        .mockResolvedValueOnce(componentStream.response);
      setup();

      await user.type(screen.getByPlaceholderText('Ask, search, or make anything...'), 'Chart patients');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      const generating = await screen.findByText('Generating component...', {}, { timeout: 3000 });
      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();

      await user.click(generating);
      expect(screen.getByText('Component Preview')).toBeInTheDocument();

      await act(async () => {
        componentStream.push(componentMarkdown);
      });
      expect(await screen.findByText(/function Chart/)).toBeInTheDocument();

      await act(async () => {
        componentStream.close();
      });

      expect(await screen.findByText('View Component')).toBeInTheDocument();
      expect(screen.getByText('Here is your chart')).toBeInTheDocument();
      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Preview' })).toBeInTheDocument();
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

    test('displays a generic error message for non-Error rejections', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockRejectedValue('bad things');
      setup();

      await user.type(screen.getByPlaceholderText('Ask, search, or make anything...'), 'Hello AI');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(await screen.findByText('Error: Unknown error')).toBeInTheDocument();
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
