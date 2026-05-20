// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { ListEmptyState, ListItem, ListScrollArea, ListSkeleton, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { loadRecentTopics } from '../../utils/spacePersistence';

interface HistoryListProps {
  currentTopicId?: string;
  onSelectedItem: (topic: Communication) => string;
}

export function HistoryList({ currentTopicId, onSelectedItem }: HistoryListProps): JSX.Element {
  const medplum = useMedplum();
  const [topics, setTopics] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTopics = async (): Promise<void> => {
      setLoading(true);
      try {
        const recentTopics = await loadRecentTopics(medplum, 20);
        setTopics(recentTopics);
      } finally {
        setLoading(false);
      }
    };
    loadTopics().catch(showErrorNotification);
  }, [medplum]);

  return (
    <ListScrollArea>
      {loading && <ListSkeleton rows={4} linesPerRow={2} />}
      {!loading && topics.length === 0 && <ListEmptyState message="No conversations yet" />}
      {!loading && topics.length > 0 && (
        <Stack gap={2}>
          {topics.map((topic) => (
            <ListItem key={topic.id} to={onSelectedItem(topic)} selected={currentTopicId === topic.id}>
              <Stack gap={0} miw={0}>
                <Text size="sm" fw={450} truncate="end">
                  {topic.topic?.text || 'Untitled conversation'}
                </Text>
                <Text size="xs" c="dimmed" fw={500}>
                  {formatDate(topic.meta?.lastUpdated)}
                </Text>
              </Stack>
            </ListItem>
          ))}
        </Stack>
      )}
    </ListScrollArea>
  );
}
