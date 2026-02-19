// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useThreadInbox } from './useThreadInbox';

const mockCommunication1: Communication = {
  resourceType: 'Communication',
  id: 'comm-1',
  status: 'completed',
  sent: '2024-01-01T10:00:00Z',
  payload: [{ contentString: 'First message' }],
};

const mockCommunication2: Communication = {
  resourceType: 'Communication',
  id: 'comm-2',
  status: 'completed',
  sent: '2024-01-01T11:00:00Z',
  payload: [{ contentString: 'Second message' }],
  partOf: [{ reference: 'Communication/comm-1' }],
};

describe('useThreadInbox', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );

  test('returns initial loading state', () => {
    const { result } = renderHook(() => useThreadInbox({ query: '', threadId: undefined }), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.threadMessages).toEqual([]);
    expect(result.current.selectedThread).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(result.current.total).toBeUndefined();
  });

  test('fetches thread messages and returns only one message per topic', async () => {
    const mockCommunication4: Communication = {
      resourceType: 'Communication',
      id: 'comm-4',
      status: 'completed',
      sent: '2024-01-01T13:00:00Z',
      payload: [{ contentString: 'Fourth message' }],
      partOf: [{ reference: 'Communication/comm-1' }],
    };

    jest.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockCommunication1 as WithId<Communication> }],
    });

    const graphqlSpy = jest.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        thread_comm1: [mockCommunication4],
      },
    } as any);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: undefined }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(graphqlSpy).toHaveBeenCalled();

    await waitFor(() => {
      expect(result.current.threadMessages).toHaveLength(1);
      expect(result.current.threadMessages[0][0].id).toBe('comm-1');
      expect(result.current.threadMessages[0][1]?.id).toBe('comm-4');
    });
  });

  test('skips topics without messages', async () => {
    const parentWithoutMessages: Communication = {
      resourceType: 'Communication',
      id: 'comm-no-replies',
      status: 'completed',
      sent: '2024-01-01T10:00:00Z',
      payload: [{ contentString: 'Parent with no replies' }],
    };

    const parentWithMessages: Communication = {
      resourceType: 'Communication',
      id: 'comm-with-replies',
      status: 'completed',
      sent: '2024-01-01T11:00:00Z',
      payload: [{ contentString: 'Parent with replies' }],
    };

    const replyMessage: Communication = {
      resourceType: 'Communication',
      id: 'comm-reply',
      status: 'completed',
      sent: '2024-01-01T12:00:00Z',
      payload: [{ contentString: 'Reply message' }],
      partOf: [{ reference: 'Communication/comm-with-replies' }],
    };

    jest.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 2,
      entry: [
        { resource: parentWithoutMessages as WithId<Communication> },
        { resource: parentWithMessages as WithId<Communication> },
      ],
    });

    jest.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        thread_commnoreplies: [],
        thread_commwithreplies: [replyMessage],
      },
    } as any);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: undefined }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.threadMessages).toHaveLength(1);
      expect(result.current.threadMessages[0][0].id).toBe('comm-with-replies');
      expect(result.current.threadMessages[0][1]?.id).toBe('comm-reply');
      expect(result.current.threadMessages.find((t) => t[0].id === 'comm-no-replies')).toBeUndefined();
    });
  });

  test('selects thread by threadId', async () => {
    await medplum.createResource(mockCommunication1);
    await medplum.createResource(mockCommunication2);

    jest.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        thread_comm1: [mockCommunication2],
      },
    } as any);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: 'comm-1' }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.selectedThread?.id).toBe('comm-1');
    });
  });

  test('reads thread from API when threadId not found in messages', async () => {
    // Don't create the resource, so it won't be found in search
    // This simulates a thread that exists but isn't in the current search results

    const readSpy = jest.spyOn(medplum, 'readResource').mockResolvedValue(mockCommunication1 as WithId<Communication>);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: 'comm-1' }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await waitFor(() => {
      expect(readSpy).toHaveBeenCalledWith('Communication', 'comm-1');
      expect(result.current.selectedThread?.id).toBe('comm-1');
    });
  });

  test('reads parent thread when reading child communication with partOf field', async () => {
    const parentCommunication: Communication = {
      resourceType: 'Communication',
      id: 'comm-0',
      status: 'completed',
      sent: '2024-01-01T09:00:00Z',
      payload: [{ contentString: 'Parent message' }],
    };

    const communicationWithPartOf: Communication = {
      ...mockCommunication1,
      partOf: [{ reference: 'Communication/comm-0' }],
    };

    jest.spyOn(medplum, 'readResource').mockResolvedValue(communicationWithPartOf as WithId<Communication>);

    const readReferenceSpy = jest.spyOn(medplum, 'readReference').mockResolvedValue(parentCommunication as any);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: 'comm-1' }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await waitFor(() => {
      expect(readReferenceSpy).toHaveBeenCalledWith({ reference: 'Communication/comm-0' });
      expect(result.current.selectedThread?.id).toBe('comm-0');
    });
  });

  test('handles thread status update', async () => {
    jest.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockCommunication1 as WithId<Communication> }],
    });

    jest.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        thread_comm1: [mockCommunication2],
      },
    } as any);

    const updatedCommunication: Communication = {
      ...mockCommunication1,
      status: 'in-progress',
    };

    const updateSpy = jest
      .spyOn(medplum, 'updateResource')
      .mockResolvedValue(updatedCommunication as WithId<Communication>);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: 'comm-1' }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.selectedThread?.id).toBe('comm-1');
    });

    await act(async () => result.current.handleThreadStatusChange('in-progress'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
      expect(result.current.selectedThread?.status).toBe('in-progress');
      expect(result.current.threadMessages[0][0].status).toBe('in-progress');
    });
  });

  test('does not update status when no thread is selected', async () => {
    const updateSpy = jest.spyOn(medplum, 'updateResource');

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: undefined }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.handleThreadStatusChange('in-progress');

    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('handles update errors gracefully', async () => {
    await medplum.createResource(mockCommunication1);
    await medplum.createResource(mockCommunication2);

    jest.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        thread_comm1: [mockCommunication2],
      },
    } as any);

    const error = new Error('Update failed');
    jest.spyOn(medplum, 'updateResource').mockRejectedValue(error);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: 'comm-1' }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.selectedThread?.id).toBe('comm-1');
    });

    await act(async () => result.current.handleThreadStatusChange('in-progress'));

    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
  });

  test('adds new thread message', async () => {
    const newMessage: Communication = {
      resourceType: 'Communication',
      id: 'comm-new',
      status: 'completed',
      sent: '2024-01-01T13:00:00Z',
      payload: [{ contentString: 'New message' }],
    };

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: undefined }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.addThreadMessage(newMessage);
    });

    await waitFor(() => {
      expect(result.current.threadMessages).toHaveLength(1);
      expect(result.current.threadMessages[0][0].id).toBe('comm-new');
      expect(result.current.threadMessages[0][1]).toBeUndefined();
    });
  });

  test('handles search errors gracefully', async () => {
    const error = new Error('Search failed');
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(medplum, 'search').mockRejectedValue(error);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: undefined }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(error);
    });

    consoleErrorSpy.mockRestore();
  });

  test('clears selected thread when threadId becomes undefined', async () => {
    await medplum.createResource(mockCommunication1);
    await medplum.createResource(mockCommunication2);

    jest.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        thread_comm1: [mockCommunication2],
      },
    } as any);

    const { result, rerender } = renderHook(({ threadId }) => useThreadInbox({ query: 'status=completed', threadId }), {
      wrapper,
      initialProps: { threadId: 'comm-1' as string | undefined },
    });

    await waitFor(() => {
      expect(result.current.selectedThread?.id).toBe('comm-1');
    });

    rerender({ threadId: undefined });

    await waitFor(() => {
      expect(result.current.selectedThread).toBeUndefined();
    });
  });
});
