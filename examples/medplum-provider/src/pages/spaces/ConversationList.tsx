// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, Group, ScrollArea, Box, Divider, Paper, Flex } from '@mantine/core';
import type { JSX } from 'react';
import { useState, useEffect } from 'react';
import { useMedplum } from '@medplum/react';
import type { Communication } from '@medplum/fhirtypes';
import { loadRecentTopics } from './space-persistence';
import { showErrorNotification } from '../../utils/notifications';
import { formatDate } from '@medplum/core';

interface ConversationListProps {
  currentTopicId?: string;
  onSelectTopic: (topicId: string) => void;
}
export function ConversationList({ currentTopicId, onSelectTopic }: ConversationListProps): JSX.Element {
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
    <Paper h="100%">
      <Flex direction="column" p={0} h="100%">
        <ScrollArea style={{ flex: 1 }}>
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
                  <Box
                    bg={currentTopicId === topic.id ? 'gray.1' : 'transparent'}
                    p="sm"
                    style={{
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      if (topic.id) {
                        onSelectTopic(topic.id);
                      }
                    }}
                  >
                    <Text size="sm" fw={500} lineClamp={2}>
                      {topic.topic?.text || 'Untitled conversation'}
                    </Text>
                    <Group gap="xs" mt={4}>
                      <Text size="xs" c="dimmed">
                        {formatDate(topic.meta?.lastUpdated)}
                      </Text>
                    </Group>
                  </Box>
                  {index < topics.length - 1 && <Divider />}
                </Stack>
              ))}
          </Stack>
        </ScrollArea>
      </Flex>
    </Paper>
  );
}
