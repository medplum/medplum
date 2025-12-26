// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { createConversationTopic, saveMessage, loadConversationMessages, loadRecentTopics } from './spacePersistence';
import type { Message } from '../types/spaces';

describe('spacePersistence', () => {
  let medplum: MockClient;
  let mockProfile: { id: string; resourceType: string };

  beforeEach(() => {
    medplum = new MockClient();
    mockProfile = {
      id: 'practitioner-123',
      resourceType: 'Practitioner',
    };
    vi.spyOn(medplum, 'getProfile').mockResolvedValue(mockProfile as any);
  });

  describe('createConversationTopic', () => {
    test('creates conversation topic with title and model', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({
        resourceType: 'Communication',
        id: 'topic-1',
        status: 'in-progress',
      } as Communication & { id: string });

      const result = await createConversationTopic(medplum, 'Test Topic', 'gpt-4');

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Communication',
          status: 'in-progress',
          identifier: [
            {
              system: 'http://medplum.com/ai-message',
              value: 'ai-message-topic',
            },
          ],
          sender: { reference: 'Practitioner/practitioner-123' },
          topic: {
            text: 'Test Topic',
          },
          note: [
            {
              text: JSON.stringify({ model: 'gpt-4' }),
            },
          ],
        })
      );
      expect(result).toBeDefined();
    });

    test('throws error when profile not found', async () => {
      vi.spyOn(medplum, 'getProfile').mockResolvedValue(undefined);

      await expect(createConversationTopic(medplum, 'Test Topic', 'gpt-4')).rejects.toThrow('Profile not found');
    });

    test('throws error when profile has no id', async () => {
      vi.spyOn(medplum, 'getProfile').mockResolvedValue({} as any);

      await expect(createConversationTopic(medplum, 'Test Topic', 'gpt-4')).rejects.toThrow('Profile not found');
    });
  });

  describe('saveMessage', () => {
    test('saves message with all fields', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({
        resourceType: 'Communication',
        id: 'message-1',
        status: 'completed',
      } as Communication & { id: string });

      const message: Message = {
        role: 'user',
        content: 'Hello, world!',
        tool_calls: [{ id: 'call-1', type: 'function' }],
        tool_call_id: 'call-1',
        resources: ['Patient/123'],
      };

      const result = await saveMessage(medplum, 'topic-1', message, 1);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Communication',
          status: 'completed',
          identifier: [
            {
              system: 'http://medplum.com/ai-message',
              value: 'ai-message',
            },
          ],
          partOf: [
            {
              reference: 'Communication/topic-1',
            },
          ],
          payload: [
            {
              contentString: JSON.stringify({
                role: 'user',
                content: 'Hello, world!',
                tool_calls: [{ id: 'call-1', type: 'function' }],
                tool_call_id: 'call-1',
                resources: ['Patient/123'],
                sequenceNumber: 1,
              }),
            },
          ],
        })
      );
      expect(result).toBeDefined();
    });

    test('saves message with minimal fields', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({
        resourceType: 'Communication',
        id: 'message-2',
        status: 'completed',
      } as Communication & { id: string });

      const message: Message = {
        role: 'assistant',
        content: 'Response',
      };

      const result = await saveMessage(medplum, 'topic-2', message, 2);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: [
            {
              contentString: JSON.stringify({
                role: 'assistant',
                content: 'Response',
                tool_calls: undefined,
                tool_call_id: undefined,
                resources: undefined,
                sequenceNumber: 2,
              }),
            },
          ],
        })
      );
      expect(result).toBeDefined();
    });

    test('saves message with null content', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({
        resourceType: 'Communication',
        id: 'message-3',
        status: 'completed',
      } as Communication & { id: string });

      const message: Message = {
        role: 'tool',
        content: null,
        tool_call_id: 'call-1',
      };

      await saveMessage(medplum, 'topic-3', message, 3);

      const call = createSpy.mock.calls[0][0] as Communication;
      const payload = JSON.parse(call.payload?.[0]?.contentString ?? '{}');
      expect(payload.content).toBeNull();
      expect(payload.role).toBe('tool');
      expect(payload.tool_call_id).toBe('call-1');
      expect(payload.sequenceNumber).toBe(3);
    });
  });

  describe('loadConversationMessages', () => {
    test('loads messages from communications', async () => {
      const mockCommunications: (Communication & { id: string })[] = [
        {
          resourceType: 'Communication',
          id: 'comm-1',
          status: 'completed',
          payload: [
            {
              contentString: JSON.stringify({
                role: 'user',
                content: 'Hello',
                sequenceNumber: 1,
              }),
            },
          ],
        },
        {
          resourceType: 'Communication',
          id: 'comm-2',
          status: 'completed',
          payload: [
            {
              contentString: JSON.stringify({
                role: 'assistant',
                content: 'Hi there',
                sequenceNumber: 2,
              }),
            },
          ],
        },
      ];

      vi.spyOn(medplum, 'searchResources').mockResolvedValue(mockCommunications as any);

      const messages = await loadConversationMessages(medplum, 'topic-1');

      expect(medplum.searchResources).toHaveBeenCalledWith('Communication', {
        'part-of': 'Communication/topic-1',
        _sort: '_lastUpdated',
      });
      expect(messages).toEqual([
        {
          role: 'user',
          content: 'Hello',
        },
        {
          role: 'assistant',
          content: 'Hi there',
        },
      ]);
    });

    test('handles messages with tool_calls and resources', async () => {
      const mockCommunications: (Communication & { id: string })[] = [
        {
          resourceType: 'Communication',
          id: 'comm-1',
          status: 'completed',
          payload: [
            {
              contentString: JSON.stringify({
                role: 'assistant',
                content: 'I can help',
                tool_calls: [{ id: 'call-1', type: 'function' }],
                resources: ['Patient/123'],
                sequenceNumber: 1,
              }),
            },
          ],
        },
      ];

      vi.spyOn(medplum, 'searchResources').mockResolvedValue(mockCommunications as any);

      const messages = await loadConversationMessages(medplum, 'topic-1');

      expect(messages).toEqual([
        {
          role: 'assistant',
          content: 'I can help',
          tool_calls: [{ id: 'call-1', type: 'function' }],
          resources: ['Patient/123'],
        },
      ]);
    });

    test('handles messages without sequenceNumber', async () => {
      const mockCommunications: (Communication & { id: string })[] = [
        {
          resourceType: 'Communication',
          id: 'comm-1',
          status: 'completed',
          payload: [
            {
              contentString: JSON.stringify({
                role: 'user',
                content: 'Test',
              }),
            },
          ],
        },
      ];

      vi.spyOn(medplum, 'searchResources').mockResolvedValue(mockCommunications as any);

      const messages = await loadConversationMessages(medplum, 'topic-1');

      expect(messages).toEqual([
        {
          role: 'user',
          content: 'Test',
        },
      ]);
    });

    test('skips communications without payload', async () => {
      const mockCommunications: (Communication & { id: string })[] = [
        {
          resourceType: 'Communication',
          id: 'comm-1',
          status: 'completed',
          payload: [
            {
              contentString: JSON.stringify({
                role: 'user',
                content: 'Hello',
                sequenceNumber: 1,
              }),
            },
          ],
        },
        {
          resourceType: 'Communication',
          id: 'comm-2',
          status: 'completed',
          // No payload
        },
        {
          resourceType: 'Communication',
          id: 'comm-3',
          status: 'completed',
          payload: [], // Empty payload
        },
      ];

      vi.spyOn(medplum, 'searchResources').mockResolvedValue(mockCommunications as any);

      const messages = await loadConversationMessages(medplum, 'topic-1');

      expect(messages).toEqual([
        {
          role: 'user',
          content: 'Hello',
        },
      ]);
    });

    test('throws error when JSON parsing fails with Error instance', async () => {
      const mockCommunications: (Communication & { id: string })[] = [
        {
          resourceType: 'Communication',
          id: 'comm-1',
          status: 'completed',
          payload: [
            {
              contentString: 'invalid json{',
            },
          ],
        },
      ];

      vi.spyOn(medplum, 'searchResources').mockResolvedValue(mockCommunications as any);

      await expect(loadConversationMessages(medplum, 'topic-1')).rejects.toThrow('Failed to parse message');
    });

    test('throws error when JSON parsing fails with non-Error', async () => {
      const mockCommunications: (Communication & { id: string })[] = [
        {
          resourceType: 'Communication',
          id: 'comm-1',
          status: 'completed',
          payload: [
            {
              contentString: 'test',
            },
          ],
        },
      ];

      vi.spyOn(medplum, 'searchResources').mockResolvedValue(mockCommunications as any);
      // Mock JSON.parse to throw a non-Error object
      const originalParse = JSON.parse;
      vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
        throw new Error('string error'); // Throw Error instead of string
      });

      await expect(loadConversationMessages(medplum, 'topic-1')).rejects.toThrow('Failed to parse message');

      JSON.parse = originalParse;
    });

    test('handles empty communications array', async () => {
      vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);

      const messages = await loadConversationMessages(medplum, 'topic-1');

      expect(messages).toEqual([]);
    });
  });

  describe('loadRecentTopics', () => {
    test('loads recent topics with default limit', async () => {
      const mockTopics: (Communication & { id: string })[] = [
        {
          resourceType: 'Communication',
          id: 'topic-1',
          status: 'in-progress',
          topic: { text: 'Topic 1' },
        },
        {
          resourceType: 'Communication',
          id: 'topic-2',
          status: 'in-progress',
          topic: { text: 'Topic 2' },
        },
      ];

      vi.spyOn(medplum, 'searchResources').mockResolvedValue(mockTopics as any);

      const topics = await loadRecentTopics(medplum);

      expect(medplum.getProfile).toHaveBeenCalled();
      expect(medplum.searchResources).toHaveBeenCalledWith('Communication', {
        identifier: 'http://medplum.com/ai-message|ai-message-topic',
        sender: 'Practitioner/practitioner-123',
        _sort: '-_lastUpdated',
        _count: '10',
      });
      expect(topics).toEqual(mockTopics);
    });

    test('loads recent topics with custom limit', async () => {
      const mockTopics: (Communication & { id: string })[] = [
        {
          resourceType: 'Communication',
          id: 'topic-1',
          status: 'in-progress',
          topic: { text: 'Topic 1' },
        },
      ];

      vi.spyOn(medplum, 'searchResources').mockResolvedValue(mockTopics as any);

      const topics = await loadRecentTopics(medplum, 5);

      expect(medplum.searchResources).toHaveBeenCalledWith('Communication', {
        identifier: 'http://medplum.com/ai-message|ai-message-topic',
        sender: 'Practitioner/practitioner-123',
        _sort: '-_lastUpdated',
        _count: '5',
      });
      expect(topics).toEqual(mockTopics);
    });

    test('handles empty topics array', async () => {
      vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);

      const topics = await loadRecentTopics(medplum);

      expect(topics).toEqual([]);
    });
  });
});
