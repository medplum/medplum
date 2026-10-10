// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  contentResponse,
  controlledStream,
  createMockStreamingResponse,
  deferred,
  fhirRequestToolCall,
  mockTopic,
  toCommunication,
  toolCallsResponse,
} from '../test-utils/spaces';
import type { Message } from '../types/spaces';
import { showErrorNotification } from '../utils/notifications';
import type { UseSpacesConversationOptions } from './useSpacesConversation';
import { useSpacesConversation } from './useSpacesConversation';

vi.mock('../utils/notifications', () => ({
  showErrorNotification: vi.fn(),
}));

const recentTopics: Communication[] = [
  { resourceType: 'Communication', id: 'topic-1', status: 'completed', topic: { text: 'Topic 1' } },
  { resourceType: 'Communication', id: 'topic-2', status: 'completed', topic: { text: 'Topic 2' } },
];

describe('useSpacesConversation', () => {
  let medplum: MockClient;
  const onNewTopic = vi.fn();

  // Routes Communication searches: `part-of` loads a topic's messages, anything else lists topics.
  function mockSearch(options: { messages?: Message[] | Promise<Message[]>; topics?: Communication[] } = {}): void {
    medplum.searchResources = vi.fn().mockImplementation(async (resourceType: string, query: any) => {
      if (resourceType !== 'Communication') {
        return [];
      }
      if (query?.['part-of']) {
        const messages = await (options.messages ?? []);
        return messages.map(toCommunication);
      }
      return options.topics ?? recentTopics;
    });
  }

  beforeEach(() => {
    medplum = new MockClient();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockSearch();
    medplum.get = vi.fn().mockResolvedValue({ resourceType: 'Patient', id: 'patient-1' });
    medplum.readResource = vi.fn().mockResolvedValue({ resourceType: 'Patient', id: 'patient-1' }) as any;
    medplum.patchResource = vi.fn().mockResolvedValue(mockTopic) as any;
    medplum.createResource = vi.fn().mockImplementation((resource: any) => {
      if (resource.identifier?.[0]?.value === 'ai-message-topic') {
        return Promise.resolve(mockTopic);
      }
      return Promise.resolve({ ...resource, id: 'message-123' });
    });
    medplum.searchOne = vi.fn().mockResolvedValue({ resourceType: 'Bot', id: 'bot-1' }) as any;
    medplum.executeBot = vi.fn().mockResolvedValue(contentResponse('Bot response'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createMockStreamingResponse('Summary'));
  });

  const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );

  function setup(
    topicId?: string
  ): ReturnType<typeof renderHook<ReturnType<typeof useSpacesConversation>, UseSpacesConversationOptions>> {
    const initialProps: UseSpacesConversationOptions = { topicId, onNewTopic };
    return renderHook((props: UseSpacesConversationOptions) => useSpacesConversation(props), {
      wrapper,
      initialProps,
    });
  }

  describe('Loading', () => {
    test('starts idle with no topic and lists recent conversations', async () => {
      const { result } = setup();

      expect(result.current.status).toBe('idle');
      expect(result.current.hasStarted).toBe(false);
      expect(result.current.messages).toEqual([]);
      expect(result.current.topicId).toBeUndefined();
      expect(result.current.topicsLoading).toBe(true);

      await waitFor(() => expect(result.current.topicsLoading).toBe(false));
      expect(result.current.topics).toEqual(recentTopics);
    });

    test('loads the route topic', async () => {
      mockSearch({ messages: [{ role: 'user', content: 'Earlier question' }] });
      const { result } = setup('topic-123');

      expect(result.current.status).toBe('loading');
      expect(result.current.hasStarted).toBe(true);

      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(result.current.messages).toEqual([{ role: 'user', content: 'Earlier question' }]);
      expect(result.current.topicId).toBe('topic-123');
    });

    test('reports a failed load and returns to the empty state', async () => {
      const error = new Error('Load failed');
      mockSearch({ messages: Promise.reject(error) });
      const { result } = setup('topic-123');

      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(showErrorNotification).toHaveBeenCalledWith(error);
      expect(result.current.hasStarted).toBe(false);
      expect(result.current.topicId).toBeUndefined();
    });

    test('reports a failed conversation list load', async () => {
      const error = new Error('History unavailable');
      medplum.searchResources = vi.fn().mockRejectedValue(error);
      const { result } = setup();

      await waitFor(() => expect(result.current.topicsLoading).toBe(false));
      expect(showErrorNotification).toHaveBeenCalledWith(error);
      expect(result.current.topics).toEqual([]);
    });

    test('keeps only the latest load when the topic changes mid-load', async () => {
      const first = deferred<Message[]>();
      mockSearch({ messages: first.promise });
      const { result, rerender } = setup('topic-a');

      mockSearch({ messages: [{ role: 'user', content: 'From B' }] });
      rerender({ topicId: 'topic-b', onNewTopic });

      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(result.current.messages).toEqual([{ role: 'user', content: 'From B' }]);

      await act(async () => first.resolve([{ role: 'user', content: 'From A' }]));
      expect(result.current.messages).toEqual([{ role: 'user', content: 'From B' }]);
      expect(result.current.topicId).toBe('topic-b');
    });

    test('resets to a new conversation when the route topic clears', async () => {
      mockSearch({ messages: [{ role: 'user', content: 'Earlier question' }] });
      const { result, rerender } = setup('topic-123');
      await waitFor(() => expect(result.current.messages).toHaveLength(1));

      rerender({ topicId: undefined, onNewTopic });

      expect(result.current.messages).toEqual([]);
      expect(result.current.hasStarted).toBe(false);
      expect(result.current.topicId).toBeUndefined();
      expect(result.current.status).toBe('idle');
    });
  });

  describe('Sending', () => {
    test('creates a topic on the first message and refreshes the conversation list', async () => {
      const { result } = setup();
      await waitFor(() => expect(result.current.topicsLoading).toBe(false));
      const topicListCalls = vi.mocked(medplum.searchResources).mock.calls.length;

      let accepted = false;
      act(() => {
        accepted = result.current.send('Hello AI', []);
      });

      expect(accepted).toBe(true);
      expect(result.current.status).toBe('sending');
      expect(result.current.hasStarted).toBe(true);
      expect(result.current.messages).toEqual([{ role: 'user', content: 'Hello AI', selectedPatients: undefined }]);

      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(onNewTopic).toHaveBeenCalledWith(mockTopic);
      expect(result.current.topicId).toBe('topic-123');
      expect(result.current.messages.map((m) => m.content)).toEqual(['Hello AI', 'Bot response']);
      expect(medplum.patchResource).not.toHaveBeenCalled();
      expect(vi.mocked(medplum.searchResources).mock.calls.length).toBeGreaterThan(topicListCalls);
    });

    test('bumps topic recency once per prompt in an existing conversation', async () => {
      mockSearch({ messages: [{ role: 'user', content: 'Earlier question' }] });
      const { result } = setup('topic-123');
      await waitFor(() => expect(result.current.status).toBe('idle'));

      act(() => {
        result.current.send('First follow-up', []);
      });
      await waitFor(() => expect(result.current.status).toBe('idle'));
      act(() => {
        result.current.send('Second follow-up', []);
      });
      await waitFor(() => expect(result.current.status).toBe('idle'));

      expect(medplum.executeBot).toHaveBeenCalledTimes(2);
      expect(medplum.patchResource).toHaveBeenCalledTimes(2);
      expect(medplum.patchResource).toHaveBeenCalledWith('Communication', 'topic-123', [
        { op: 'add', path: '/sent', value: expect.any(String) },
      ]);
      expect(onNewTopic).not.toHaveBeenCalled();
    });

    test('refuses empty input, a send while loading, and a send while sending', async () => {
      const load = deferred<Message[]>();
      mockSearch({ messages: load.promise });
      const { result } = setup('topic-123');

      expect(result.current.send('', [])).toBe(false);
      expect(result.current.send('   ', [])).toBe(false);
      expect(result.current.status).toBe('loading');
      expect(result.current.send('Too early', [])).toBe(false);

      await act(async () => load.resolve([]));
      await waitFor(() => expect(result.current.status).toBe('idle'));

      const bot = deferred<any>();
      medplum.executeBot = vi.fn().mockReturnValue(bot.promise);
      act(() => {
        expect(result.current.send('First', [])).toBe(true);
      });
      expect(result.current.send('Second', [])).toBe(false);

      await act(async () => bot.resolve(contentResponse('Reply')));
      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(medplum.executeBot).toHaveBeenCalledTimes(1);
      expect(result.current.messages.map((m) => m.content)).toEqual(['First', 'Reply']);
    });

    test('accepts patient context without text', async () => {
      const { result } = setup();
      const patient = { reference: 'Patient/patient-1', display: 'Homer Simpson' };

      act(() => {
        expect(result.current.send('', [patient])).toBe(true);
      });

      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(result.current.messages[0]).toEqual({ role: 'user', content: '', selectedPatients: [patient] });
    });

    test('reports tool progress, streams the summary and clears progress when done', async () => {
      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce(toolCallsResponse([fhirRequestToolCall('tc-1', 'GET', 'Patient/patient-1')]))
        .mockResolvedValueOnce(contentResponse('Final answer'));
      const get = deferred<any>();
      medplum.get = vi.fn().mockReturnValue(get.promise);
      const stream = controlledStream();
      vi.mocked(fetch).mockResolvedValue(stream.response);
      const { result } = setup();

      act(() => {
        result.current.send('Look things up', []);
      });

      await waitFor(() => expect(result.current.currentFhirRequest).toBe('Step 1: GET Patient/patient-1'));
      // The tool call is on screen while its request is still running
      expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(result.current.status).toBe('sending');
      await act(async () => get.resolve({ resourceType: 'Patient', id: 'patient-1' }));
      await waitFor(() => expect(result.current.currentFhirRequest).toBeUndefined());
      expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);

      await act(async () => stream.push('Hello'));
      await waitFor(() => expect(result.current.streamingContent).toBe('Hello'));
      await act(async () => stream.push(' world'));
      await waitFor(() => expect(result.current.streamingContent).toBe('Hello world'));
      expect(result.current.status).toBe('sending');

      await act(async () => stream.close());
      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(result.current.streamingContent).toBeUndefined();
      const reply = result.current.messages.at(-1);
      expect(reply?.content).toBe('Hello world');
      expect(reply?.resources).toEqual(['Patient/patient-1']);
      expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    });

    test('streams the generated component and keeps it once the send completes', async () => {
      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce(toolCallsResponse([fhirRequestToolCall('tc-1', 'GET', 'Patient/patient-1')], true))
        .mockResolvedValueOnce(contentResponse('Final answer'));
      const component = controlledStream();
      vi.mocked(fetch)
        .mockResolvedValueOnce(createMockStreamingResponse('Summary'))
        .mockResolvedValueOnce(component.response);
      const { result } = setup();

      act(() => {
        result.current.send('Chart it', []);
      });

      await waitFor(() => expect(result.current.streamingComponentCode).toBe(''));
      expect(result.current.generatedComponent).toBeUndefined();

      await act(async () => component.push('```jsx\nconst Chart = () => null;\n'));
      await waitFor(() => expect(result.current.streamingComponentCode).toBe('```jsx\nconst Chart = () => null;\n'));

      await act(async () => {
        component.push('```');
        component.close();
      });
      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(result.current.streamingComponentCode).toBeUndefined();
      expect(result.current.generatedComponent).toEqual({
        code: 'const Chart = () => null;',
        resources: ['Patient/patient-1'],
      });
      expect(result.current.messages.at(-1)?.componentCode).toBe('const Chart = () => null;');
    });

    test('appends an error reply when the bot fails', async () => {
      medplum.executeBot = vi.fn().mockRejectedValue(new Error('Bot execution failed'));
      const { result } = setup();

      act(() => {
        result.current.send('Hello AI', []);
      });

      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(result.current.messages.map((m) => m.content)).toEqual(['Hello AI', 'Error: Bot execution failed']);
    });

    test('passes the selected model and reasoning effort to the bot', async () => {
      const { result } = setup();

      act(() => {
        result.current.setModel('gpt-custom');
        result.current.setReasoningEffort('low');
      });
      act(() => {
        result.current.send('Hello AI', []);
      });

      await waitFor(() => expect(result.current.status).toBe('idle'));
      const params = vi.mocked(medplum.executeBot).mock.calls[0][1] as {
        parameter: { name: string; valueString: string }[];
      };
      expect(params.parameter.find((p) => p.name === 'model')?.valueString).toBe('gpt-custom');
      expect(params.parameter.find((p) => p.name === 'reasoning_effort')?.valueString).toBe('low');
    });
  });

  describe('Races', () => {
    test('discards an in-flight send when the route moves to another topic', async () => {
      mockSearch({ messages: [{ role: 'user', content: 'Earlier question' }] });
      const { result, rerender } = setup('topic-123');
      await waitFor(() => expect(result.current.status).toBe('idle'));

      const bot = deferred<any>();
      medplum.executeBot = vi.fn().mockReturnValue(bot.promise);
      act(() => {
        result.current.send('Slow question', []);
      });
      expect(result.current.status).toBe('sending');

      mockSearch({ messages: [{ role: 'user', content: 'Other conversation' }] });
      rerender({ topicId: 'topic-456', onNewTopic });

      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(result.current.messages).toEqual([{ role: 'user', content: 'Other conversation' }]);

      await act(async () => bot.resolve(contentResponse('Late reply')));
      expect(result.current.messages).toEqual([{ role: 'user', content: 'Other conversation' }]);
      expect(result.current.status).toBe('idle');
      expect(result.current.topicId).toBe('topic-456');
    });

    test('discards an in-flight send when a new conversation starts', async () => {
      mockSearch({ messages: [{ role: 'user', content: 'Earlier question' }] });
      const { result, rerender } = setup('topic-123');
      await waitFor(() => expect(result.current.status).toBe('idle'));

      const bot = deferred<any>();
      medplum.executeBot = vi.fn().mockReturnValue(bot.promise);
      act(() => {
        result.current.send('Slow question', []);
      });

      rerender({ topicId: undefined, onNewTopic });
      expect(result.current.messages).toEqual([]);
      expect(result.current.status).toBe('idle');

      await act(async () => bot.resolve(contentResponse('Late reply')));
      expect(result.current.messages).toEqual([]);
      expect(result.current.hasStarted).toBe(false);

      // The next send starts a fresh conversation rather than continuing the old one
      medplum.executeBot = vi.fn().mockResolvedValue(contentResponse('Fresh reply'));
      act(() => {
        result.current.send('New question', []);
      });
      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(onNewTopic).toHaveBeenCalledTimes(1);
      expect(result.current.messages.map((m) => m.content)).toEqual(['New question', 'Fresh reply']);
    });

    test('does not reload the topic it just created when the route follows it', async () => {
      const { result, rerender } = setup();
      act(() => {
        result.current.send('Hello AI', []);
      });
      await waitFor(() => expect(onNewTopic).toHaveBeenCalledWith(mockTopic));
      await waitFor(() => expect(result.current.status).toBe('idle'));

      rerender({ topicId: mockTopic.id, onNewTopic });

      expect(result.current.status).toBe('idle');
      expect(result.current.messages.map((m) => m.content)).toEqual(['Hello AI', 'Bot response']);
      const messageLoads = vi
        .mocked(medplum.searchResources)
        .mock.calls.filter(([, query]) => (query as any)?.['part-of']);
      expect(messageLoads).toHaveLength(0);
    });
  });
});
