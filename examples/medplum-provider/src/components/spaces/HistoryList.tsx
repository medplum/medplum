// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, Group, ScrollArea, Divider, Paper, Flex } from '@mantine/core';
import type { JSX } from 'react';
import { useState, useEffect } from 'react';
import { useMedplum, MedplumLink } from '@medplum/react';
import type { Communication } from '@medplum/fhirtypes';
import { loadRecentTopics } from '../../utils/spacePersistence';
import { showErrorNotification } from '../../utils/notifications';
import { formatDate } from '@medplum/core';
import classes from './HistoryList.module.css';
import cx from 'clsx';

interface HistoryListProps {
  currentTopicId?: string;
  onSelectTopic: (topicId: string) => void;
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
    <Paper h="100%" bg="transparent" p={0}>
      <Flex direction="column" p={0} h="100%">
        <ScrollArea style={{ flex: 1 }} p={0}>
          <Stack gap="xs" px="md">
            <Text fw={600} c="dimmed" mt="md">
              Recent Conversations
            </Text>
            {loading && (
              <Text size="sm" c="dimmed">
                Loading...
              </Text>
            )}
            {!loading && topics.length === 0 && (
              <Text size="sm" c="dimmed">
                No conversations yet
              </Text>
            )}
            {!loading &&
              topics.length > 0 &&
              topics.map((topic, index) => (
                <Stack gap={0} key={topic.id}>
                  <MedplumLink to={onSelectedItem(topic)} style={{ textDecoration: 'none' }}>
                    <div
                      className={cx(classes.conversationItem, {
                        [classes.conversationItemActive]: currentTopicId === topic.id,
                      })}
                    >
                      <Text size="sm" fw={500} lineClamp={1} c="inherit">
                        {topic.topic?.text || 'Untitled conversation'}
                      </Text>
                      <Group gap="xs" mt={4} justify="space-between">
                        <Text size="xs" c="dimmed" style={{ opacity: 0.7 }}>
                          {formatDate(topic.meta?.lastUpdated)}
                        </Text>
                      </Group>
                    </div>
                  </MedplumLink>
                  {index < topics.length - 1 && <Divider />}
                </Stack>
              ))}
          </Stack>
        </ScrollArea>
      </Flex>
    </Paper>
  );
}
