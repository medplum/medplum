// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { renderHook, waitFor, act } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react';
import type { JSX } from 'react';
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { useThreadInbox } from './useThreadInbox';
import type { WithId } from '@medplum/core';

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

const mockCommunication3: Communication = {
  resourceType: 'Communication',
  id: 'comm-3',
  status: 'completed',
  sent: '2024-01-01T12:00:00Z',
  payload: [{ contentString: 'Third message' }],
  partOf: [{ reference: 'Communication/comm-1' }],
};

describe('useThreadInbox', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
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
  });

  test('fetches thread messages without partOf field', async () => {
    await medplum.createResource(mockCommunication1);
    await medplum.createResource(mockCommunication2);
    await medplum.createResource(mockCommunication3);

    // Mock search to return only communications without partOf
    const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication1 as WithId<Communication> }],
    });

    // Mock graphql to return communications with partOf
    const graphqlSpy = vi.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        CommunicationList: [mockCommunication2, mockCommunication3],
      },
    } as any);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: undefined }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(searchSpy).toHaveBeenCalled();
    expect(graphqlSpy).toHaveBeenCalled();
  });

  test('selects thread by threadId', async () => {
    await medplum.createResource(mockCommunication1);
    await medplum.createResource(mockCommunication2);

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication1 as WithId<Communication> }],
    });

    vi.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        CommunicationList: [mockCommunication2],
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
    await medplum.createResource(mockCommunication1);

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    });

    vi.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        CommunicationList: [],
      },
    } as any);

    const readSpy = vi.spyOn(medplum, 'readResource').mockResolvedValue(mockCommunication1 as WithId<Communication>);

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

  test('does not select thread with partOf field when reading from API', async () => {
    const communicationWithPartOf: Communication = {
      ...mockCommunication1,
      partOf: [{ reference: 'Communication/comm-0' }],
    };

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    });

    vi.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        CommunicationList: [],
      },
    } as any);

    vi.spyOn(medplum, 'readResource').mockResolvedValue(communicationWithPartOf as WithId<Communication>);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: 'comm-1' }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.selectedThread).toBeUndefined();
    });
  });

  test('handles thread status update', async () => {
    await medplum.createResource(mockCommunication1);

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication1 as WithId<Communication> }],
    });

    vi.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        CommunicationList: [],
      },
    } as any);

    const updatedCommunication: Communication = {
      ...mockCommunication1,
      status: 'in-progress',
    };

    const updateSpy = vi
      .spyOn(medplum, 'updateResource')
      .mockResolvedValue(updatedCommunication as WithId<Communication>);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: 'comm-1' }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.selectedThread?.id).toBe('comm-1');
    });

    await result.current.handleThreadtatusChange('in-progress');

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
      expect(result.current.selectedThread?.status).toBe('in-progress');
    });
  });

  test('does not update status when no thread is selected', async () => {
    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    });

    vi.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        CommunicationList: [],
      },
    } as any);

    const updateSpy = vi.spyOn(medplum, 'updateResource');

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: undefined }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.handleThreadtatusChange('in-progress');

    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('handles update errors gracefully', async () => {
    await medplum.createResource(mockCommunication1);

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication1 as WithId<Communication> }],
    });

    vi.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        CommunicationList: [],
      },
    } as any);

    const error = new Error('Update failed');
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(error);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: 'comm-1' }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.selectedThread?.id).toBe('comm-1');
    });

    await result.current.handleThreadtatusChange('in-progress');

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

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    });

    vi.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        CommunicationList: [],
      },
    } as any);

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
    vi.spyOn(medplum, 'search').mockRejectedValue(error);

    const { result } = renderHook(() => useThreadInbox({ query: 'status=completed', threadId: undefined }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(error);
    });
  });

  test('clears selected thread when threadId becomes undefined', async () => {
    await medplum.createResource(mockCommunication1);

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication1 as WithId<Communication> }],
    });

    vi.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        CommunicationList: [],
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
