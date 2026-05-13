// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Loader, Text, Tooltip } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse, Parameters } from '@medplum/fhirtypes';
import { useMedplum, useWhisper } from '@medplum/react-hooks';
import { IconMicrophone, IconPlayerStopFilled } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuestionnaireFormProps } from './QuestionnaireForm';
import { QuestionnaireForm } from './QuestionnaireForm';

const DEFAULT_AI_MODEL = 'gpt-5.4-nano';
const SILENCE_DEBOUNCE_MS = 3000;

const DEFAULT_SYSTEM_PROMPT = `You are a medical questionnaire assistant. Your task is to help users fill out medical questionnaires using voice input.

Given a FHIR Questionnaire, any existing QuestionnaireResponse (if provided), and a transcript of what the user said, generate a valid FHIR QuestionnaireResponse that accurately captures their answers.

Important guidelines:
- Return ONLY a valid JSON QuestionnaireResponse resource
- If an existing QuestionnaireResponse is provided, modify it based on the user's spoken input (add, update, or remove answers as appropriate)
- Map the user's spoken answers to the appropriate questionnaire items using linkId
- Use appropriate value types (valueString, valueBoolean, valueCoding, etc.) based on the question type
- If the user's answer is ambiguous or doesn't clearly map to a question, use your best judgment
- Preserve any existing answers that the user didn't mention
- Set status to "in-progress" since this is a draft response

Example 1:
Questionnaire:
{
  "resourceType": "Questionnaire",
  "status": "active",
  "item": [
    {
      "linkId": "1",
      "text": "What is your name?",
      "type": "string"
    },
    {
      "linkId": "2",
      "text": "What is your age?",
      "type": "integer"
    }
  ]
}

User's spoken input: "My name is John Smith and I'm 35 years old"

Expected QuestionnaireResponse:
{
  "resourceType": "QuestionnaireResponse",
  "status": "in-progress",
  "item": [
    {
      "linkId": "1",
      "text": "What is your name?",
      "answer": [
        {
          "valueString": "John Smith"
        }
      ]
    },
    {
      "linkId": "2",
      "text": "What is your age?",
      "answer": [
        {
          "valueInteger": 35
        }
      ]
    }
  ]
}

Example 2:
Questionnaire:
{
  "resourceType": "Questionnaire",
  "status": "active",
  "item": [
    {
      "linkId": "1",
      "text": "Do you have any allergies?",
      "type": "boolean"
    },
    {
      "linkId": "2",
      "text": "Please list your allergies",
      "type": "string",
      "enableWhen": [
        {
          "question": "1",
          "operator": "=",
          "answerBoolean": true
        }
      ]
    },
    {
      "linkId": "3",
      "text": "Are you currently taking any medications?",
      "type": "boolean"
    }
  ]
}

Existing QuestionnaireResponse:
{
  "resourceType": "QuestionnaireResponse",
  "status": "in-progress",
  "item": [
    {
      "linkId": "1",
      "answer": [
        {
          "valueBoolean": true
        }
      ]
    }
  ]
}

User's spoken input: "I'm allergic to penicillin and yes I'm taking metformin"

Expected QuestionnaireResponse:
{
  "resourceType": "QuestionnaireResponse",
  "status": "in-progress",
  "item": [
    {
      "linkId": "1",
      "answer": [
        {
          "valueBoolean": true
        }
      ]
    },
    {
      "linkId": "2",
      "answer": [
        {
          "valueString": "penicillin"
        }
      ]
    },
    {
      "linkId": "3",
      "answer": [
        {
          "valueBoolean": true
        }
      ]
    }
  ]
}`;

export interface AIRealTimeQuestionnaireFormProps extends QuestionnaireFormProps {
  /** AI model to use for processing voice input. Defaults to 'gpt-5.5' */
  readonly aiModel?: string;
  /** Custom system prompt for the AI. If not provided, uses default medical questionnaire assistant prompt */
  readonly systemPrompt?: string;
  /** Optional callback invoked whenever a new transcript chunk arrives from the realtime API */
  readonly onTranscript?: (fullTranscript: string, chunk: string) => void;
}

export function AIRealTimeQuestionnaireForm(props: AIRealTimeQuestionnaireFormProps): JSX.Element | null {
  const { aiModel = DEFAULT_AI_MODEL, systemPrompt = DEFAULT_SYSTEM_PROMPT, onTranscript, ...questionnaireFormProps } = props;
  const medplum = useMedplum();
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>(
    props.questionnaireResponse as QuestionnaireResponse | undefined
  );
  const [isProcessing, setIsProcessing] = useState(false);
  // Bumped only when the AI replaces the response, so QuestionnaireForm remounts
  // and picks up the new defaultValue (the inner hook ignores later prop changes).
  const [responseVersion, setResponseVersion] = useState(0);

  const questionnaireRef = useRef<Questionnaire | null>(null);
  const inputRef = useRef('');
  const inFlightRef = useRef(false);
  const responseRef = useRef<QuestionnaireResponse | undefined>(questionnaireResponse);
  const flushTranscriptRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    responseRef.current = questionnaireResponse;
  }, [questionnaireResponse]);

  const isVoiceEnabled = medplum.getProject()?.features?.includes('ai-realtime') ?? false;

  useEffect(() => {
    inputRef.current = '';
  }, []);

  const { start, stop, status } = useWhisper({
    model: 'gpt-4o-transcribe',
    onTranscript: (text) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const previous = inputRef.current.trim();
      const next = previous ? `${previous} ${trimmed}` : trimmed;
      inputRef.current = next;
      onTranscript?.(next, trimmed);
    },
  });

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const processTranscript = useCallback(
    async (transcript: string) => {
      if (!questionnaireRef.current || !transcript.trim()) {
        return;
      }

      setIsProcessing(true);
      try {
        // Read the latest response via ref so back-to-back calls chain off the AI's previous output
        // rather than a stale closure value.
        const existingResponse = responseRef.current;
        let userMessage = `Questionnaire:\n${JSON.stringify(questionnaireRef.current, null, 2)}`;

        if (existingResponse?.item && existingResponse.item.length > 0) {
          userMessage += `\n\nExisting QuestionnaireResponse:\n${JSON.stringify(existingResponse, null, 2)}`;
        }

        userMessage += `\n\nUser's spoken input:\n${transcript}`;

        const aiParameters: Parameters = {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'messages',
              valueString: JSON.stringify([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
              ]),
            },
            {
              name: 'model',
              valueString: aiModel,
            },
            {
              name: 'temperature',
              valueString: '0.3',
            },
          ],
        };

        const response = await medplum.post<Parameters>(medplum.fhirUrl('$ai'), aiParameters);

        // Extract the AI's response content
        const contentParam = response.parameter?.find((p) => p.name === 'content');
        if (contentParam?.valueString) {
          // Try to parse the response as a QuestionnaireResponse
          // The AI might wrap it in markdown code blocks, so clean it up
          let responseText = contentParam.valueString.trim();

          // Remove markdown code blocks if present
          if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```(?:json)?\s*\n/, '').replace(/\n```\s*$/, '');
          }

          try {
            const aiQuestionnaireResponse = JSON.parse(responseText) as QuestionnaireResponse;
            // Keep responseRef in lockstep so a chained drain reads this value, not the stale state.
            responseRef.current = aiQuestionnaireResponse;
            setQuestionnaireResponse(aiQuestionnaireResponse);
            setResponseVersion((v) => v + 1);
          } catch (parseError) {
            console.error('Failed to parse AI response as QuestionnaireResponse:', parseError);
            console.error('Response text:', responseText);
          }
        }
      } catch (error) {
        console.error('Error processing transcript with AI:', error);
      } finally {
        setIsProcessing(false);
      }
    },
    [medplum, aiModel, systemPrompt]
  );

  // Latest-closure ref so the function can recurse for auto-drain and the debounced
  // silence handler can fire it without depending on its identity.
  useEffect(() => {
    flushTranscriptRef.current = async (): Promise<void> => {
      if (inFlightRef.current) {
        // Another $ai call is in flight. The auto-drain at the end of that call
        // (or the next silence event) will pick up whatever queued up.
        return;
      }
      const pending = inputRef.current.trim();
      if (!pending) {
        return;
      }
      // Snapshot + clear so further utterances queue cleanly into a fresh buffer.
      inputRef.current = '';
      onTranscript?.('', '');
      inFlightRef.current = true;
      try {
        await processTranscript(pending);
      } finally {
        inFlightRef.current = false;
      }
      // Auto-drain: if speech accumulated while we were processing and the user
      // isn't actively mid-utterance, fire the next $ai immediately.
      if (inputRef.current.trim() && statusRef.current !== 'speech_started') {
        flushTranscriptRef.current().catch((err) => console.error('Error draining transcript:', err));
      }
    };
  }, [processTranscript, onTranscript]);

  const debouncedFlush = useDebouncedCallback(() => {
    // The debounce may fire while the user is mid-utterance (we only reschedule on
    // speech_stopped, not on speech_started). If they're still speaking, bail —
    // the next speech_stopped will restart the debounce.
    if (statusRef.current === 'speech_started') {
      return;
    }
    flushTranscriptRef.current().catch((err) =>
      showNotification({ color: 'red', message: `Error flushing transcript: ${normalizeErrorString(err)}` })
    );
  }, SILENCE_DEBOUNCE_MS);

  useEffect(() => {
    if (status === 'speech_stopped') {
      debouncedFlush();
    }
  }, [status, debouncedFlush]);

  const isConnecting = status === 'requesting_microphone' || status === 'connecting' || status === 'connected';
  const isRecording = status === 'listening' || status === 'speech_started' || status === 'speech_stopped';
  const isActive = isConnecting || isRecording;

  const handleVoiceToggle = (): void => {
    if (isActive) {
      stop();
    } else {
      start().catch((err) => console.error('Error starting voice input:', err));
    }
  };

  let voiceTooltip = 'Start voice input to answer questionnaire';
  if (!isVoiceEnabled) {
    voiceTooltip = 'Voice input is not enabled in this project. Add the "ai-realtime" feature to enable it.';
  } else if (isActive) {
    voiceTooltip = 'Listening — speak naturally, pauses send to AI. Click to stop.';
  }

  let voiceBackground: string | undefined;
  if (!isVoiceEnabled) {
    voiceBackground = 'gray';
  } else if (!isRecording && !isConnecting) {
    voiceBackground = '#7c3aed';
  }

  // Track the questionnaire prop
  useEffect(() => {
    if (typeof props.questionnaire === 'object' && 'resourceType' in props.questionnaire) {
      questionnaireRef.current = props.questionnaire;
    }
  }, [props.questionnaire]);

  return (
    <>
      <Group justify="flex-end" mb="md" gap="sm">
        {isProcessing && (
          <Group gap={6} aria-live="polite">
            <Loader size="xs" color="violet" />
            <Text size="sm" c="dimmed">
              Processing…
            </Text>
          </Group>
        )}
        <Tooltip label={voiceTooltip}>
          <ActionIcon
            aria-label={isActive ? 'Stop voice input' : 'Start voice input'}
            radius="xl"
            size="lg"
            variant="filled"
            color={isRecording ? 'red' : undefined}
            bg={voiceBackground}
            onClick={handleVoiceToggle}
            disabled={isConnecting || !isVoiceEnabled}
            loading={isConnecting}
            data-disabled={!isVoiceEnabled || undefined}
            style={!isVoiceEnabled ? { pointerEvents: 'auto' } : undefined}
          >
            {isRecording ? <IconPlayerStopFilled size={18} /> : <IconMicrophone size={18} />}
          </ActionIcon>
        </Tooltip>
      </Group>
      <QuestionnaireForm
        key={responseVersion}
        {...questionnaireFormProps}
        questionnaireResponse={questionnaireResponse}
        onChange={(response) => {
          setQuestionnaireResponse(response);
          props.onChange?.(response);
        }}
      />
    </>
  );
}
