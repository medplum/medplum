// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from 'react';
import { Communication } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { createReference, getReferenceString } from '@medplum/core';
import { showErrorNotification } from '../utils/notifications';

export interface UseThreadInboxOptions {
  query: string;
  threadId: string | undefined;
}

export interface UseThreadInboxReturn {
  loading: boolean;
  error: Error | null;
  threadMessages: [Communication, Communication | undefined][];
  selectedThread: Communication | undefined;
  addThreadMessage: (message: Communication) => void;
  handleThreadtatusChange: (newStatus: Communication['status']) => Promise<void>;
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
  const [loading, setLoading] = useState(false);
  const [threadMessages, setThreadMessages] = useState<[Communication, Communication | undefined][]>([]);
  const [selectedThread, setSelectedThread] = useState<Communication | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchAllCommunications = async (): Promise<void> => {
      const searchParams = new URLSearchParams(query);
      searchParams.append('part-of:missing', 'true');
      const searchResult = await medplum.searchResources('Communication', searchParams, { cache: 'no-cache' });

      const partOfReferences = searchResult.map((ref) => getReferenceString(ref)).join(' or part-of eq ');

      const allCommunications = await medplum.graphql(`
        query {
          CommunicationList(
            _sort: "-sent"
            _filter: "part-of eq ${partOfReferences}"
          ) {
            id
            partOf {
              reference
            }
            sender {
              display
            }
            payload {
              contentString
            }
            status
          }
        }
      `);

      const map = new Map<string, Communication>();
      allCommunications.data.CommunicationList.forEach((communication: Communication) => {
        const partOfRef = communication.partOf?.[0]?.reference;
        if (partOfRef) {
          if (!map.has(partOfRef)) {
            map.set(partOfRef, communication);
          }
        }
      });

      const threads: [Communication, Communication][] = searchResult
        .map((communication: Communication) => {
          const lastCommunication = map.get(createReference(communication).reference);
          if (lastCommunication) {
            return [communication, lastCommunication];
          }
          return undefined;
        })
        .filter((t): t is [Communication, Communication] => t !== undefined);

      setThreadMessages(threads);
    };

    setLoading(true);
    fetchAllCommunications()
      .catch((error) => {
        setError(error as Error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [medplum, query]);

  useEffect(() => {
    const fetchThread = async (): Promise<void> => {
      if (threadId) {
        const thread = threadMessages.find((t) => t[0].id === threadId);
        if (thread) {
          setSelectedThread(thread[0]);
        } else {
          try {
            const communication: Communication = await medplum.readResource('Communication', threadId);
            if (communication.partOf === undefined) {
              setSelectedThread(communication);
            }
          } catch (error) {
            showErrorNotification(error);
          }
        }
      } else {
        setSelectedThread(undefined);
      }
    };

    fetchThread().catch((error) => {
      setError(error as Error);
    });
  }, [threadId, threadMessages, medplum]);

  const handleThreadtatusChange = async (newStatus: Communication['status']): Promise<void> => {
    if (!selectedThread) {
      return;
    }
    try {
      const updatedThread = await medplum.updateResource({
        ...selectedThread,
        status: newStatus,
      });
      setSelectedThread(updatedThread);
    } catch (error) {
      showErrorNotification(error);
    }
  };

  const addThreadMessage = (message: Communication): void => {
    setThreadMessages([[message, undefined], ...threadMessages]);
  };

  return {
    loading,
    error,
    threadMessages,
    selectedThread,
    addThreadMessage,
    handleThreadtatusChange,
  };
}
