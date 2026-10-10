// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Communication } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fhirRequestToolCall } from '../../test-utils/spaces';
import type { Message } from '../../types/spaces';
import type { SpacesInboxProps } from './SpacesInbox';
import { SpacesInbox } from './SpacesInbox';

const recentTopics: Communication[] = [
  {
    resourceType: 'Communication',
    id: 'topic-1',
    status: 'completed',
    meta: { lastUpdated: '2023-01-01T10:00:00Z' },
    topic: { text: 'Topic 1' },
  },
  {
    resourceType: 'Communication',
    id: 'topic-2',
    status: 'completed',
    meta: { lastUpdated: '2023-01-02T10:00:00Z' },
    topic: { text: 'Topic 2' },
  },
];

describe('SpacesInbox', () => {
  let medplum: MockClient;
  const onAdd = vi.fn();

  function makeProps(overrides: Partial<SpacesInboxProps> = {}): SpacesInboxProps {
    return {
      status: 'idle',
      messages: [],
      topicId: undefined,
      hasStarted: false,
      topics: [],
      topicsLoading: false,
      currentFhirRequest: undefined,
      streamingContent: undefined,
      streamingComponentCode: undefined,
      generatedComponent: undefined,
      models: [{ value: 'gpt-5.5', label: 'GPT-5.5' }],
      model: 'gpt-5.5',
      setModel: vi.fn(),
      reasoningEffort: 'high',
      setReasoningEffort: vi.fn(),
      send: vi.fn().mockReturnValue(true),
      onSelectedItem: (topic: Communication) => `/Spaces/Communication/${topic.id}`,
      onAdd,
      ...overrides,
    };
  }

  // Props for a loaded conversation.
  function conversation(messages: Message[], overrides: Partial<SpacesInboxProps> = {}): SpacesInboxProps {
    return makeProps({ messages, topicId: 'topic-123', hasStarted: true, ...overrides });
  }

  beforeEach(() => {
    medplum = new MockClient();
    vi.restoreAllMocks();
    vi.clearAllMocks();

    Element.prototype.scrollTo = vi.fn();
    medplum.searchResources = vi
      .fn()
      .mockImplementation((resourceType: string) => Promise.resolve(resourceType === 'Patient' ? [HomerSimpson] : []));
    medplum.readReference = vi.fn().mockImplementation((ref: any) => {
      const [resourceType, id] = ref.reference?.split('/') || [];
      return Promise.resolve({ resourceType, id, meta: {} } as any);
    });
  });

  const inbox = (props: SpacesInboxProps): JSX.Element => (
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <SpacesInbox {...props} />
        </MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  );

  const setup = (props: SpacesInboxProps = makeProps()): ReturnType<typeof render> => render(inbox(props));

  const panelHeader = (title: string): HTMLElement =>
    screen.getByText(title).closest('div')?.parentElement as HTMLElement;

  const closePanel = (user: UserEvent, title: string): Promise<void> =>
    user.click(panelHeader(title).querySelector('.mantine-CloseButton-root') as HTMLElement);

  const goBackFromDetails = (user: UserEvent): Promise<void> =>
    user.click(panelHeader('Resource Details').querySelector('button') as HTMLElement);

  const promptInput = (): HTMLElement => screen.getByPlaceholderText('Ask, search, or make anything...');

  describe('Empty state', () => {
    test('renders the welcome message and the prompt', () => {
      setup();

      expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
      expect(promptInput()).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show conversations' })).toBeInTheDocument();
    });
  });

  describe('Conversation list', () => {
    test('starts hidden, expands to show recent conversations, and collapses again', async () => {
      const user = userEvent.setup();
      setup(makeProps({ topics: recentTopics }));

      // Collapsed: the list is aria-hidden, so its links are not exposed
      expect(screen.queryByRole('link', { name: /Topic 1/ })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Show conversations' }));

      const link = await screen.findByRole('link', { name: /Topic 1/ });
      expect(link).toHaveAttribute('href', '/Spaces/Communication/topic-1');
      expect(screen.getByRole('link', { name: /Topic 2/ })).toHaveAttribute('href', '/Spaces/Communication/topic-2');

      await user.click(screen.getByRole('button', { name: 'Hide conversations' }));
      expect(screen.queryByRole('link', { name: /Topic 1/ })).not.toBeInTheDocument();
    });

    test('shows empty state when there are no conversations', async () => {
      const user = userEvent.setup();
      setup();

      await user.click(screen.getByRole('button', { name: 'Show conversations' }));
      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });

    test('forwards the New conversation click', async () => {
      const user = userEvent.setup();
      setup();

      await user.click(screen.getByRole('button', { name: 'New conversation' }));
      expect(onAdd).toHaveBeenCalledTimes(1);
    });
  });

  describe('Conversation view', () => {
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

    test('hides system messages and renders tool calls with toggleable responses', async () => {
      const user = userEvent.setup();
      setup(conversation(toolCallMessages));

      expect(screen.getByText('Look things up')).toBeInTheDocument();
      expect(screen.queryByText('hidden system prompt')).not.toBeInTheDocument();
      expect(screen.queryByText('How can I help you today?')).not.toBeInTheDocument();
      expect(screen.getByText('GET')).toBeInTheDocument();
      expect(screen.getByText('CALL')).toBeInTheDocument();
      expect(screen.getByText('Unable to parse tool call')).toBeInTheDocument();
      await user.click(screen.getByText('Response'));
      expect(screen.getByText(/"resourceType": "Patient"/)).toBeInTheDocument();
      expect(screen.getByText('▲')).toBeInTheDocument();
      await user.click(screen.getByText('Response'));
      expect(screen.getByText('▼')).toBeInTheDocument();
    });

    test('renders user and assistant messages, including error replies', () => {
      setup(
        conversation([
          { role: 'user', content: 'Hello AI' },
          { role: 'assistant', content: 'Hello! How can I help you?' },
          { role: 'user', content: 'Again' },
          { role: 'assistant', content: 'Error: Bot execution failed' },
        ])
      );

      expect(screen.getByText('Hello AI')).toBeInTheDocument();
      expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
      expect(screen.getByText(/Error: Bot execution failed/)).toBeInTheDocument();
    });

    test('shows selected patients above the user message', async () => {
      setup(
        conversation([
          { role: 'user', content: 'Summarize', selectedPatients: [HomerSimpson] },
          { role: 'assistant', content: 'About Homer' },
        ])
      );

      const userMessage = screen.getByText('Summarize').parentElement?.parentElement as HTMLElement;
      expect(await within(userMessage).findByText('Homer Simpson')).toBeInTheDocument();
    });

    test('renders resource boxes and opens and closes the resource panel', async () => {
      const user = userEvent.setup();
      setup(conversation([{ role: 'assistant', content: 'Found patient', resources: ['Patient/patient-123'] }]));

      const resourceBox = await screen.findByTestId('resource-box');
      expect(within(resourceBox).getByText('Patient/patient-123')).toBeInTheDocument();

      await user.click(resourceBox);
      expect(await screen.findByTestId('resource-panel')).toBeInTheDocument();
      expect(screen.getByText('Resource Details')).toBeInTheDocument();

      await closePanel(user, 'Resource Details');
      await waitFor(() => expect(screen.queryByTestId('resource-panel')).not.toBeInTheDocument());
    });

    test('opens the results list, drills into a result, navigates back, and closes each panel', async () => {
      const user = userEvent.setup();
      const resources = ['Patient/p-1', 'Patient/p-2', 'Patient/p-3'];
      setup(conversation([{ role: 'assistant', content: 'Found three', resources }]));

      await user.click(screen.getByText('3 results'));
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
      setup(conversation([{ role: 'assistant', content: 'Here you go', componentCode, resources: ['Patient/p-1'] }]));

      await user.click(screen.getByText('View Component'));
      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Resources' }));
      await user.click(await screen.findByTestId('resource-box'));
      expect(screen.getByText('Resource Details')).toBeInTheDocument();
      await goBackFromDetails(user);
      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      await closePanel(user, 'Component Preview');
      expect(screen.queryByText('Component Preview')).not.toBeInTheDocument();
    });

    test('shows a scroll-to-bottom button when scrolled up and scrolls down on click', async () => {
      const user = userEvent.setup();
      setup(conversation([{ role: 'user', content: 'Persisted question' }]));

      const message = screen.getByText('Persisted question');
      const viewport = message.closest('.mantine-ScrollArea-viewport') as HTMLElement;
      Object.defineProperties(viewport, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
      fireEvent.scroll(viewport);
      await user.click(screen.getByLabelText('Scroll to bottom'));
      expect(Element.prototype.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' });
      expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();
    });
  });

  describe('Sending', () => {
    test('sends the input and clears it when accepted', async () => {
      const user = userEvent.setup();
      const props = makeProps();
      setup(props);

      await user.type(promptInput(), 'Hello AI');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(props.send).toHaveBeenCalledWith('Hello AI', []);
      expect(promptInput()).toHaveValue('');
    });

    test('sends on Enter but not on Shift+Enter', async () => {
      const user = userEvent.setup();
      const props = makeProps();
      setup(props);

      await user.type(promptInput(), 'Hello AI');
      await user.keyboard('{Shift>}{Enter}{/Shift}');
      expect(props.send).not.toHaveBeenCalled();

      await user.keyboard('{Enter}');
      expect(props.send).toHaveBeenCalledWith('Hello AI\n', []);
    });

    test('offers voice mode instead of Send for empty input', () => {
      setup();

      expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start voice mode' })).toBeInTheDocument();
    });

    test('sends selected patients as context', async () => {
      const user = userEvent.setup();
      const props = makeProps();
      setup(props);

      await user.click(screen.getByRole('button', { name: 'Patients' }));
      await user.click(await screen.findByText('Homer Simpson', {}, { timeout: 3000 }));
      await user.type(promptInput(), 'Summarize');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(props.send).toHaveBeenCalledWith('Summarize', [expect.objectContaining({ id: HomerSimpson.id })]);
    });
  });

  describe('Component generation', () => {
    test('streams the generated component into the preview panel and keeps it as a card', async () => {
      const user = userEvent.setup();
      const base = conversation([{ role: 'user', content: 'Chart patients' }], { status: 'sending' });
      const { rerender } = setup(base);

      rerender(inbox({ ...base, streamingComponentCode: '' }));
      const generating = screen.getByText('Generating component...');
      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();

      await closePanel(user, 'Component Preview');
      expect(screen.queryByText('Component Preview')).not.toBeInTheDocument();
      await user.click(generating);
      expect(screen.getByText('Component Preview')).toBeInTheDocument();

      const code = 'function Chart() {\n  return <Text>Generated chart</Text>;\n}';
      rerender(inbox({ ...base, streamingComponentCode: `\`\`\`jsx\n${code}\n` }));
      expect(screen.getByText(/function Chart/)).toBeInTheDocument();

      rerender(
        inbox(
          conversation(
            [
              { role: 'user', content: 'Chart patients' },
              { role: 'assistant', content: 'Here is your chart', componentCode: code, resources: ['Patient/p-1'] },
            ],
            { generatedComponent: { code, resources: ['Patient/p-1'] } }
          )
        )
      );

      expect(screen.getByText('View Component')).toBeInTheDocument();
      expect(screen.getByText('Here is your chart')).toBeInTheDocument();
      expect(screen.queryByText('Generating component...')).not.toBeInTheDocument();
      expect(screen.getByText('Component Preview')).toBeInTheDocument();
      expect(await screen.findByText('Generated chart')).toBeInTheDocument();
    });
  });
});
