// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { normalizeErrorString } from '@medplum/core';
import type { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useStabilizedCallback } from '@medplum/react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from '../types/spaces';
import { showErrorNotification } from '../utils/notifications';
import { processMessage } from '../utils/spaceMessaging';
import type { ReasoningEffort, SpaceModelOption } from '../utils/spaceModels';
import { DEFAULT_REASONING_EFFORT, getDefaultModel, getProjectModels } from '../utils/spaceModels';
import { loadConversationMessages, loadRecentTopics, touchConversationTopic } from '../utils/spacePersistence';

const RECENT_TOPICS_LIMIT = 20;

export type ConversationStatus = 'idle' | 'loading' | 'sending';

export interface GeneratedComponent {
  code: string;
  resources?: string[];
}

export interface UseSpacesConversationOptions {
  /** The topic selected by the route, or undefined for a new conversation. */
  topicId: string | undefined;
  /** Called once the first message of a new conversation has created its topic. */
  onNewTopic?: (topic: Communication) => void;
}

export interface UseSpacesConversationResult {
  status: ConversationStatus;
  messages: Message[];
  /** The topic the conversation belongs to, once loaded or created. */
  topicId: string | undefined;
  /** False only for a new conversation with nothing sent yet. */
  hasStarted: boolean;
  topics: Communication[];
  topicsLoading: boolean;
  /** Description of the FHIR request currently running, during a send. */
  currentFhirRequest: string | undefined;
  /** The summary streamed so far, during a send. */
  streamingContent: string | undefined;
  /** The component code streamed so far; '' once generation starts, undefined otherwise. */
  streamingComponentCode: string | undefined;
  /** The component produced by the last completed send. */
  generatedComponent: GeneratedComponent | undefined;
  models: SpaceModelOption[];
  model: string;
  setModel: (model: string) => void;
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  /**
   * Sends a message. Returns false, without side effects, when the conversation is busy or
   * there is nothing to send (no text and no patients).
   */
  send: (text: string, patients: (Patient | Reference<Patient>)[]) => boolean;
}

/**
 * Owns the state and async flow of one Spaces conversation: loading the selected topic,
 * sending messages through the agent loop, and keeping the recent-topics list current.
 *
 * Every load and send takes a request id. Results and progress events from a request that
 * is no longer the latest are dropped, so switching topics or starting a new conversation
 * mid-send can never leak the old reply into the new view.
 * @param options - The route topic and the new-topic callback
 * @returns The conversation state and actions, ready to spread into a view component
 */
export function useSpacesConversation(options: UseSpacesConversationOptions): UseSpacesConversationResult {
  const { topicId: routeTopicId } = options;
  const medplum = useMedplum();
  const onNewTopic = useStabilizedCallback(options.onNewTopic);
  const models = useMemo(() => getProjectModels(medplum), [medplum]);
  const [model, setModel] = useState(() => getDefaultModel(models));
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT);

  const [status, setStatusState] = useState<ConversationStatus>(routeTopicId ? 'loading' : 'idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [topicId, setTopicId] = useState<string | undefined>(routeTopicId);
  const [memoizedRouteTopicId, setMemoizedRouteTopicId] = useState(routeTopicId);
  const [topics, setTopics] = useState<Communication[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [currentFhirRequest, setCurrentFhirRequest] = useState<string | undefined>();
  const [streamingContent, setStreamingContent] = useState<string | undefined>();
  const [streamingComponentCode, setStreamingComponentCode] = useState<string | undefined>();
  const [generatedComponent, setGeneratedComponent] = useState<GeneratedComponent | undefined>();

  // statusRef mirrors status synchronously so send() can refuse re-entry within the same tick
  const statusRef = useRef<ConversationStatus>(routeTopicId ? 'loading' : 'idle');
  const requestIdRef = useRef(0);
  // The topic whose messages are (being) shown, so the navigation that follows topic
  // creation does not reload the conversation that is already on screen.
  const loadedTopicIdRef = useRef<string | undefined>(undefined);

  // Adjust state during render (useThreadInbox pattern) so a new route topic clears the old
  // conversation on this same render. The route landing on the topic this hook just created
  // is not a change of conversation.
  if (routeTopicId !== memoizedRouteTopicId) {
    setMemoizedRouteTopicId(routeTopicId);
    if (routeTopicId !== topicId) {
      setTopicId(routeTopicId);
      setMessages([]);
      setGeneratedComponent(undefined);
      setCurrentFhirRequest(undefined);
      setStreamingContent(undefined);
      setStreamingComponentCode(undefined);
      setStatusState(routeTopicId ? 'loading' : 'idle');
    }
  }

  const setStatus = useCallback((next: ConversationStatus): void => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const resetProgress = useCallback((): void => {
    setCurrentFhirRequest(undefined);
    setStreamingContent(undefined);
    setStreamingComponentCode(undefined);
  }, []);

  const refreshTopics = useCallback(async (): Promise<void> => {
    setTopics(await loadRecentTopics(medplum, RECENT_TOPICS_LIMIT));
  }, [medplum]);

  // The loading flag is only cleared, never re-set, so later refreshes update the list in place
  const loadTopics = useCallback(async (): Promise<void> => {
    try {
      await refreshTopics();
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setTopicsLoading(false);
    }
  }, [refreshTopics]);

  useEffect(() => {
    loadTopics().catch(console.error);
  }, [loadTopics]);

  const loadTopic = useCallback(
    async (id: string | undefined): Promise<void> => {
      // Every topic change supersedes whatever load or send is in flight
      const requestId = ++requestIdRef.current;
      if (!id) {
        statusRef.current = 'idle';
        return;
      }
      statusRef.current = 'loading';
      try {
        const loaded = await loadConversationMessages(medplum, id);
        if (requestId === requestIdRef.current) {
          setMessages(loaded);
        }
      } catch (err) {
        if (requestId === requestIdRef.current) {
          // Forget the topic so the view returns to its empty state and a later visit retries
          loadedTopicIdRef.current = undefined;
          setTopicId(undefined);
          showErrorNotification(err);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setStatus('idle');
        }
      }
    },
    [medplum, setStatus]
  );

  useEffect(() => {
    if (memoizedRouteTopicId === loadedTopicIdRef.current && memoizedRouteTopicId !== undefined) {
      return;
    }
    loadedTopicIdRef.current = memoizedRouteTopicId;
    loadTopic(memoizedRouteTopicId).catch(console.error);
  }, [memoizedRouteTopicId, loadTopic]);

  const send = useCallback(
    (text: string, patients: (Patient | Reference<Patient>)[]): boolean => {
      const content = text.trim();
      // A message can be sent with patient context alone, no text required
      if (status !== 'idle' || statusRef.current !== 'idle' || (!content && patients.length === 0)) {
        return false;
      }

      const requestId = ++requestIdRef.current;
      const guard =
        <A extends unknown[]>(fn: (...args: A) => void) =>
        (...args: A): void => {
          if (requestId === requestIdRef.current) {
            fn(...args);
          }
        };

      const activeTopicId = topicId;
      if (activeTopicId) {
        // Bump the topic's meta.lastUpdated so the list (sorted by -_lastUpdated) reflects
        // the latest prompt. Fire-and-forget: a stale sort is not worth failing the send.
        touchConversationTopic(medplum, activeTopicId)
          .then(guard(() => refreshTopics().catch(console.error)))
          .catch(console.error);
      }

      const history = messages;
      const userMessage: Message = {
        role: 'user',
        content,
        selectedPatients: patients.length > 0 ? patients : undefined,
      };
      // Grows as tool turns complete, so the view shows them live and an error keeps them
      let shown: Message[] = [...history, userMessage];
      setMessages(shown);
      resetProgress();
      setGeneratedComponent(undefined);
      setStatus('sending');

      processMessage({
        medplum,
        messages: history,
        userMessage,
        topicId: activeTopicId,
        model,
        reasoningEffort,
        events: {
          onTopicCreated: guard((topic) => {
            // Mark the topic as shown before the route follows it, so nothing reloads it
            loadedTopicIdRef.current = topic.id;
            setTopicId(topic.id);
            onNewTopic(topic);
            refreshTopics().catch(console.error);
          }),
          onProgress: guard((progress) => {
            shown = progress;
            setMessages(progress);
          }),
          onFhirRequest: guard(setCurrentFhirRequest),
          onStreamChunk: guard((chunk) => {
            setStreamingContent((prev) => (prev ?? '') + chunk);
            setCurrentFhirRequest(undefined);
          }),
          onComponentStart: guard(() => {
            setStreamingComponentCode('');
            setCurrentFhirRequest(undefined);
          }),
          onComponentStreamChunk: guard((chunk) => {
            setStreamingComponentCode((prev) => (prev ?? '') + chunk);
            setCurrentFhirRequest(undefined);
          }),
        },
      })
        .then(
          guard((result) => {
            setMessages(result.messages);
            if (result.assistantMessage.componentCode) {
              setGeneratedComponent({
                code: result.assistantMessage.componentCode,
                resources: result.assistantMessage.resources,
              });
            }
          })
        )
        .catch(
          guard((err: unknown) => {
            setMessages([...shown, { role: 'assistant', content: `Error: ${normalizeErrorString(err)}` }]);
          })
        )
        .finally(
          guard(() => {
            resetProgress();
            setStatus('idle');
          })
        );

      return true;
    },
    [medplum, status, messages, topicId, model, reasoningEffort, onNewTopic, refreshTopics, resetProgress, setStatus]
  );

  return {
    status,
    messages,
    topicId,
    hasStarted: messages.length > 0 || topicId !== undefined,
    topics,
    topicsLoading,
    currentFhirRequest,
    streamingContent,
    streamingComponentCode,
    generatedComponent,
    models,
    model,
    setModel,
    reasoningEffort,
    setReasoningEffort,
    send,
  };
}
