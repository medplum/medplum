// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { useCallback, useEffect, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

export interface UseThreadInboxOptions {
  query: string;
  threadId: string | undefined;
}

export interface UseThreadInboxReturn {
  loading: boolean;
  error: Error | null;
  // Tuple: [Parent Thread, Last Message in Thread (optional)]
  threadMessages: [Communication, Communication | undefined][];
  selectedThread: Communication | undefined;
  total: number | undefined;
  addThreadMessage: (message: Communication) => void;
  handleThreadStatusChange: (newStatus: Communication['status']) => void;
  refreshThreadMessages: () => Promise<void>;
}

/*
useThreadInbox is a hook that fetches all communications and returns the thread messages and selected thread.
All comunications returned do not have a partOf field.
It also provides a function to update the status of the selected thread.

@param query - The query to fetch all communications.
@param threadId - The id of the thread to select.
@returns The thread messages and selected thread.
@returns A function to update the status of the selected thread.
*/
export function useThreadInbox({ query, threadId }: UseThreadInboxOptions): UseThreadInboxReturn {
  const medplum = useMedplum();
  const [loading, setLoading] = useState(true);
  const [threadMessages, setThreadMessages] = useState<[Communication, Communication | undefined][]>([]);
  const [selectedThread, setSelectedThread] = useState<Communication | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const fetchAllCommunications = useCallback(async (): Promise<void> => {
    const searchParams = new URLSearchParams(query);
    searchParams.append('identifier:not', 'ai-message-topic');
    searchParams.append('part-of:missing', 'true');
    searchParams.append('_has:Communication:part-of:_id:not', 'null');

    const bundle = await medplum.search('Communication', searchParams.toString(), { cache: 'no-cache' });
    const parents =
      bundle.entry
        ?.map((entry) => entry.resource as Communication)
        .filter((r): r is Communication => r !== undefined) || [];

    if (bundle.total !== undefined) {
      setTotal(bundle.total);
    }

    if (parents.length === 0) {
      setThreadMessages([]);
      return;
    }

    const queryParts = parents.map((parent) => {
      const safeId = parent.id?.replaceAll('-', '') || '';
      const alias = `thread_${safeId}`;
      const ref = getReferenceString(parent);

      return `
          ${alias}: CommunicationList(
            part_of: "${ref}"
            _sort: "-sent"
            _count: 1
          ) {
            id
            meta {
              lastUpdated
            }
            partOf {
              reference
            }
            sender {
              display
              reference
            }
            payload {
              contentString
            }
            sent
            status
          }
        `;
    });

    const fullQuery = `
        query {
          ${queryParts.join('\n')}
        }
      `;

    const response = await medplum.graphql(fullQuery);

    const threadsWithReplies = parents
      .map((parent) => {
        const safeId = parent.id?.replaceAll('-', '') || '';
        const alias = `thread_${safeId}`;
        const childList = response.data[alias] as Communication[] | undefined;
        const lastMessage = childList && childList.length > 0 ? childList[0] : undefined;
        return [parent, lastMessage];
      })
      .filter((thread): thread is [Communication, Communication] => thread[1] !== undefined);

    setThreadMessages(threadsWithReplies);
  }, [medplum, query]);

  useEffect(() => {
    setLoading(true);
    fetchAllCommunications()
      .catch((err: Error) => {
        setError(err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [fetchAllCommunications]);

  useEffect(() => {
    const fetchThread = async (): Promise<void> => {
      if (!threadId) {
        setSelectedThread(undefined);
        return;
      }

      const thread = threadMessages.find((t) => t[0].id === threadId);
      if (thread) {
        setSelectedThread(thread[0]);
        return;
      }

      const communication: Communication = await medplum.readResource('Communication', threadId);
      if (communication.partOf === undefined) {
        setSelectedThread(communication);
      } else {
        const parentRef = communication.partOf[0].reference;
        if (parentRef) {
          const parent = await medplum.readReference({ reference: parentRef } as any);
          setSelectedThread(parent as Communication);
        }
      }
    };

    fetchThread().catch((err: Error) => {
      setError(err);
    });
  }, [threadId, threadMessages, medplum]);

  const handleThreadStatusChange = (newStatus: Communication['status']): void => {
    if (!selectedThread) {
      return;
    }
    const doUpdate = async (): Promise<void> => {
      const updatedThread = await medplum.updateResource({ ...selectedThread, status: newStatus });
      setSelectedThread(updatedThread);
      setThreadMessages((prev) =>
        prev.map(([parent, lastMsg]) => (parent.id === updatedThread.id ? [updatedThread, lastMsg] : [parent, lastMsg]))
      );
    };
    doUpdate().catch((err: Error) => setError(err));
  };

  const addThreadMessage = (message: Communication): void => {
    const doAdd = async (): Promise<void> => {
      await fetchAllCommunications();
      setThreadMessages((prev) => [[message, undefined], ...prev]);
    };
    doAdd().catch((err: Error) => setError(err));
  };

  return {
    loading,
    error,
    threadMessages,
    selectedThread,
    total,
    addThreadMessage,
    handleThreadStatusChange,
    refreshThreadMessages: fetchAllCommunications,
  };
}
