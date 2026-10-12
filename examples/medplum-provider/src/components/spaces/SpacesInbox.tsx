// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Stack, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import type { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { ListWithDetailPane, MedplumLink, useMedplum, useResource } from '@medplum/react';
import { IconLayoutSidebarLeftCollapse } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedComponent, Message } from '../../types/spaces';
import { showErrorNotification } from '../../utils/notifications';
import { processMessage } from '../../utils/spaceMessaging';
import type { ReasoningEffort } from '../../utils/spaceModels';
import { DEFAULT_REASONING_EFFORT, getDefaultModel, getProjectModels } from '../../utils/spaceModels';
import { loadConversationMessages, loadRecentTopics, touchConversationTopic } from '../../utils/spacePersistence';
import { ConversationPane } from './ConversationPane';

// Spaces always renders the chat pane — with no topic selected it is a new (draft)
// conversation — so this placeholder keeps ListWithDetailPane on its detail slot
// instead of swapping to the empty-detail slot, which would remount the chat once
// the first message creates the real topic.
const NEW_CONVERSATION: Communication = { resourceType: 'Communication', status: 'in-progress' };

interface SpaceInboxProps {
  topic: Communication | Reference<Communication> | undefined;
  onNewTopic: (topic: Communication) => void;
  onSelectedItem: (topic: Communication) => string;
  onAdd?: () => void;
}

export function SpacesInbox(props: SpaceInboxProps): JSX.Element {
  const { topic: topicRef, onNewTopic, onSelectedItem, onAdd } = props;
  const medplum = useMedplum();
  const topic = useResource(topicRef);
  const models = useMemo(() => getProjectModels(medplum), [medplum]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => getDefaultModel(models));
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentFhirRequest, setCurrentFhirRequest] = useState<string | undefined>();
  const [currentTopicId, setCurrentTopicId] = useState(topic?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [topics, setTopics] = useState<Communication[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [streamingContent, setStreamingContent] = useState<string | undefined>();
  const [streamingComponentCode, setStreamingComponentCode] = useState<string | undefined>();
  const [generatedComponent, setGeneratedComponent] = useState<GeneratedComponent | undefined>();
  // Keys ConversationPane, so a change of conversation remounts it with fresh view state. Not
  // bumped when the route follows the topic the first message just created.
  const [conversationKey, setConversationKey] = useState(0);
  const isSendingRef = useRef(false);
  const loadVersionRef = useRef(0);

  // Load conversation when topic changes
  useEffect(() => {
    const topicId = topic?.id;
    if (topicId) {
      if (isSendingRef.current) {
        return;
      }
      loadVersionRef.current++;
      const myVersion = loadVersionRef.current;
      const loadTopic = async (): Promise<void> => {
        try {
          setLoading(true);
          const loadedMessages = await loadConversationMessages(medplum, topicId);
          // Check if this load is stale (a newer load or send has started)
          if (myVersion !== loadVersionRef.current) {
            return;
          }
          setMessages([...loadedMessages]);
          setCurrentTopicId(topicId);
          setHasStarted(true);
          setStreamingComponentCode(undefined);
          setGeneratedComponent(undefined);
          setConversationKey((prev) => prev + 1);
        } catch (error) {
          showErrorNotification(error);
        } finally {
          if (myVersion === loadVersionRef.current) {
            setLoading(false);
          }
        }
      };
      loadTopic().catch(showErrorNotification);
    } else {
      setMessages([]);
      setHasStarted(false);
      setCurrentTopicId(undefined);
      setGeneratedComponent(undefined);
      setConversationKey((prev) => prev + 1);
    }
  }, [topic, medplum]);

  const refreshTopics = useCallback(async (): Promise<void> => {
    setTopics(await loadRecentTopics(medplum, 20));
  }, [medplum]);

  // Load the conversation list. `refreshKey` is bumped by processMessage when a
  // send creates or renames a topic. The loading flag is only cleared, never
  // re-set, so refreshes update the list in place without a skeleton flash.
  useEffect(() => {
    refreshTopics()
      .catch(showErrorNotification)
      .finally(() => setTopicsLoading(false));
  }, [refreshTopics, refreshKey]);

  const sendMessage = async (text: string, selectedPatients: (Patient | Reference<Patient>)[]): Promise<void> => {
    const isFirstMessage = !hasStarted;
    if (isFirstMessage) {
      setHasStarted(true);
    }

    // Bump the topic's meta.lastUpdated on every user prompt so the conversation
    // list (sorted by -_lastUpdated) reflects latest user activity. This is the
    // only place that touches the parent topic — assistant/tool output is persisted
    // as child messages and never bumps it. A just-created topic (first message) is
    // already fresh. Fire-and-forget: a stale sort is not worth failing the send.
    if (!isFirstMessage && currentTopicId) {
      touchConversationTopic(medplum, currentTopicId)
        .then(() => setRefreshKey((prev) => prev + 1))
        .catch(console.error);
    }

    const userMessage: Message = {
      role: 'user',
      content: text,
      selectedPatients: selectedPatients.length > 0 ? selectedPatients : undefined,
    };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setCurrentFhirRequest(undefined);
    setStreamingContent(undefined);
    setGeneratedComponent(undefined);
    setLoading(true);
    isSendingRef.current = true;
    loadVersionRef.current++;

    try {
      const result = await processMessage({
        medplum,
        input: text,
        userMessage,
        currentMessages,
        currentTopicId,
        selectedModel,
        selectedReasoningEffort,
        isFirstMessage,
        setCurrentTopicId,
        setRefreshKey,
        setCurrentFhirRequest,
        onNewTopic,
        selectedPatients,
        onStreamChunk: (chunk) => {
          setStreamingContent((prev) => (prev ?? '') + chunk);
          setCurrentFhirRequest(undefined);
        },
        onComponentStart: () => {
          setStreamingComponentCode('');
          setCurrentFhirRequest(undefined);
        },
        onComponentStreamChunk: (chunk) => {
          setStreamingComponentCode((prev) => (prev ?? '') + chunk);
          setCurrentFhirRequest(undefined);
        },
      });
      setStreamingContent(undefined);
      setStreamingComponentCode(undefined);
      setMessages(result.updatedMessages);
      if (result.assistantMessage.componentCode) {
        setGeneratedComponent({
          code: result.assistantMessage.componentCode,
          resources: result.assistantMessage.resources,
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setMessages([...currentMessages, { role: 'assistant', content: `Error: ${errorMessage}` }]);
    } finally {
      isSendingRef.current = false;
      setStreamingContent(undefined);
      setStreamingComponentCode(undefined);
      setLoading(false);
    }
  };

  // Returns false, without side effects, when a send is running or there is nothing to send.
  // A message can be sent with patient context alone, no text required.
  const send = (text: string, selectedPatients: (Patient | Reference<Patient>)[]): boolean => {
    if (isSendingRef.current) {
      return false;
    }
    const trimmed = text.trim();
    if (!trimmed && selectedPatients.length === 0) {
      return false;
    }
    sendMessage(trimmed, selectedPatients).catch(showErrorNotification);
    return true;
  };

  return (
    <ListWithDetailPane<Communication>
      items={topics}
      loading={topicsLoading}
      selectedKey={topic?.id ?? currentTopicId}
      selected={topic ?? NEW_CONVERSATION}
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
          messages={messages}
          loading={loading}
          hasStarted={hasStarted}
          currentFhirRequest={currentFhirRequest}
          streamingContent={streamingContent}
          streamingComponentCode={streamingComponentCode}
          generatedComponent={generatedComponent}
          models={models}
          model={selectedModel}
          setModel={setSelectedModel}
          reasoningEffort={selectedReasoningEffort}
          setReasoningEffort={setSelectedReasoningEffort}
          send={send}
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
