// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Stack, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { ListWithDetailPane, MedplumLink } from '@medplum/react';
import { IconLayoutSidebarLeftCollapse } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { UseSpacesConversationResult } from '../../hooks/useSpacesConversation';
import { ConversationPane } from './ConversationPane';

// Spaces always renders the chat pane — with no topic selected it is a new (draft)
// conversation — so this placeholder keeps ListWithDetailPane on its detail slot
// instead of swapping to the empty-detail slot, which would remount the chat once
// the first message creates the real topic.
const NEW_CONVERSATION: Communication = { resourceType: 'Communication', status: 'in-progress' };

export interface SpacesInboxProps extends UseSpacesConversationResult {
  onSelectedItem: (topic: Communication) => string;
  onAdd?: () => void;
}

export function SpacesInbox(props: SpacesInboxProps): JSX.Element {
  const { topics, topicsLoading, topicId, conversationKey, onSelectedItem, onAdd, ...conversation } = props;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ListWithDetailPane<Communication>
      items={topics}
      loading={topicsLoading}
      selectedKey={topicId}
      selected={topics.find((t) => t.id === topicId) ?? NEW_CONVERSATION}
      listWidth={280}
      listVisible={sidebarOpen}
      headerText="Conversations"
      headerActions={
        <ActionIcon variant="subtle" color="gray" onClick={() => setSidebarOpen(false)} aria-label="Hide conversations">
          <IconLayoutSidebarLeftCollapse size={18} />
        </ActionIcon>
      }
      emptyList={
        <Text size="sm" c="dimmed" ta="center" mt="md">
          No conversations yet
        </Text>
      }
      renderItem={(item) => <TopicListItem topic={item} uri={onSelectedItem(item)} />}
      renderDetail={() => (
        <ConversationPane
          key={conversationKey}
          {...conversation}
          sidebarOpen={sidebarOpen}
          onShowSidebar={() => setSidebarOpen(true)}
          onAdd={onAdd}
        />
      )}
    />
  );
}

function TopicListItem({ topic, uri }: { topic: Communication; uri: string }): JSX.Element {
  return (
    <MedplumLink to={uri} underline="never" display="block" c="inherit">
      <Stack gap={4} p="xs">
        <Text size="sm" fw={500} lineClamp={1}>
          {topic.topic?.text || 'Untitled conversation'}
        </Text>
        <Text size="xs" c="dimmed">
          {formatDate(topic.meta?.lastUpdated)}
        </Text>
      </Stack>
    </MedplumLink>
  );
}
