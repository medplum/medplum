// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Button, Collapse, Divider, Flex, Loader, Stack, Text } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Identifier, Parameters, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { useMedplum, useWhisper } from '@medplum/react-hooks';
import { IconChevronDown, IconChevronUp, IconCircleFilled, IconMicrophone } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import classes from './AIRealTimeQuestionnaireForm.module.css';
import type { QuestionnaireFormProps } from './QuestionnaireForm';
import { QuestionnaireForm } from './QuestionnaireForm';

const SILENCE_DEBOUNCE_MS = 3000;
const DEFAULT_IDLE_LABEL = 'Start Dictation to complete this form with your voice';
const TRANSCRIPT_PLACEHOLDER = 'Start speaking to see your transcribed words...';
const VOICE_TRANSCRIPT_EXTENSION_URL = 'https://medplum.com/ai-voice-transcript';

const botIdentifier: Identifier = {
  system: 'https://www.medplum.com/bots',
  value: 'ai-realtime-questionnaire',
};

const DEFAULT_INSTRUCTIONS = (
  <Stack gap="xs">
    <Text>
      To fill out the form, just speak naturally and the dictation tool will map your spoken answers to the form fields.
    </Text>
    <Text>Pause briefly between thoughts to start processing.</Text>
  </Stack>
);

export interface AIRealTimeQuestionnaireFormProps extends QuestionnaireFormProps {
  readonly aiModel?: string;
  readonly onTranscript?: (fullTranscript: string, chunk: string) => void;
  readonly voiceInstructions?: ReactNode;
}

export function AIRealTimeQuestionnaireForm(props: AIRealTimeQuestionnaireFormProps): JSX.Element {
 
  const { aiModel, onTranscript, voiceInstructions, ...questionnaireFormProps } = props;
  const medplum = useMedplum();
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>(
    props.questionnaireResponse as QuestionnaireResponse | undefined
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  // Bumped only when the AI replaces the response, so QuestionnaireForm remounts
  // and picks up the new defaultValue (the inner hook ignores later prop changes).
  const [responseVersion, setResponseVersion] = useState(0);

  const questionnaireRef = useRef<Questionnaire | null>(null);
  const inputRef = useRef('');
  const inFlightRef = useRef(false);
  const responseRef = useRef<QuestionnaireResponse | undefined>(questionnaireResponse);
  const flushTranscriptRef = useRef<() => Promise<void>>(async () => {});
  const transcriptViewportRef = useRef<HTMLDivElement>(null);
  // Cumulative transcript across all flushes in this session, written to the
  // QuestionnaireResponse as a custom extension each time the bot returns.
  const fullTranscriptRef = useRef('');

  useEffect(() => {
    responseRef.current = questionnaireResponse;
  }, [questionnaireResponse]);

  const [botAvailability, setBotAvailability] = useState<'loading' | 'available' | 'unavailable'>('loading');
  useEffect(() => {
    let cancelled = false;
    medplum
      .searchOne('Bot', { identifier: `${botIdentifier.system ?? ''}|${botIdentifier.value ?? ''}` })
      .then((bot) => {
        if (!cancelled) {
          setBotAvailability(bot ? 'available' : 'unavailable');
        }
      })
      .catch((err) => {
        console.error('Error checking bot availability:', err);
        if (!cancelled) {
          setBotAvailability('unavailable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [medplum]);

  const isProjectVoiceEnabled = medplum.getProject()?.features?.includes('ai-realtime') ?? false;
  const isVoiceEnabled = isProjectVoiceEnabled && botAvailability === 'available';
  const idleLabel: ReactNode =
    botAvailability === 'unavailable' ? (
      <>
        Voice dictation unavailable: bot '{botIdentifier.value ?? ''}' is not deployed
        <br />
        Please contact support
      </>
    ) : (
      DEFAULT_IDLE_LABEL
    );

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
      setTranscript(next);
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
        const existingResponse = responseRef.current;
        const parameter: Parameters['parameter'] = [
          { name: 'questionnaire', valueString: JSON.stringify(questionnaireRef.current) },
          { name: 'transcript', valueString: transcript },
        ];
        if (existingResponse?.item && existingResponse.item.length > 0) {
          parameter.push({ name: 'questionnaireResponse', valueString: JSON.stringify(existingResponse) });
        }
        if (aiModel) {
          parameter.push({ name: 'model', valueString: aiModel });
        }

        const response = await medplum.executeBot(botIdentifier, {
          resourceType: 'Parameters',
          parameter,
        });

        const responseParam = response.parameter?.find((p: { name: string }) => p.name === 'questionnaireResponse');
        if (responseParam?.valueString) {
          try {
            const aiQuestionnaireResponse = JSON.parse(responseParam.valueString) as QuestionnaireResponse;
            const preservedExtensions = (aiQuestionnaireResponse.extension ?? []).filter(
              (e) => e.url !== VOICE_TRANSCRIPT_EXTENSION_URL
            );
            aiQuestionnaireResponse.extension = [
              ...preservedExtensions,
              { url: VOICE_TRANSCRIPT_EXTENSION_URL, valueString: fullTranscriptRef.current },
            ];
            responseRef.current = aiQuestionnaireResponse;
            setQuestionnaireResponse(aiQuestionnaireResponse);
            setResponseVersion((v) => v + 1);
          } catch (parseError) {
            console.error('Failed to parse bot response as QuestionnaireResponse:', parseError);
            showNotification({ color: 'red', message: `Failed to parse bot response as QuestionnaireResponse: ${normalizeErrorString(parseError)}` });
          }
        }
      } catch (error) {
        console.error('Error processing transcript with AI:', error);
      } finally {
        setIsProcessing(false);
      }
    },
    [medplum, aiModel]
  );

  useEffect(() => {
    flushTranscriptRef.current = async (): Promise<void> => {
      if (inFlightRef.current) {
        return;
      }
      const pending = inputRef.current.trim();
      if (!pending) {
        return;
      }
      inputRef.current = '';
      setTranscript('');
      onTranscript?.('', '');
      fullTranscriptRef.current = fullTranscriptRef.current ? `${fullTranscriptRef.current} ${pending}` : pending;
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
    if (statusRef.current === 'speech_started') {
      return;
    }
    flushTranscriptRef
      .current()
      .catch((err) =>
        showNotification({ color: 'red', message: `Error flushing transcript: ${normalizeErrorString(err)}` })
      );
  }, SILENCE_DEBOUNCE_MS);

  useEffect(() => {
    if (status === 'speech_stopped') {
      debouncedFlush();
    }
  }, [status, debouncedFlush]);

  // Auto-scroll the transcript area to the latest text as it streams in.
  useEffect(() => {
    const viewport = transcriptViewportRef.current;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [transcript]);

  const isConnecting = status === 'requesting_microphone' || status === 'connecting' || status === 'connected';
  const isRecording = status === 'listening' || status === 'speech_started' || status === 'speech_stopped';

  const handleStartDictation = useCallback((): void => {
    setExpanded(true);
    start().catch((err) => console.error('Error starting voice input:', err));
  }, [start]);

  const handleStopDictation = useCallback((): void => {
    setIsStopping(true);
    stop();

    debouncedFlush.cancel();
    flushTranscriptRef
      .current()
      .catch((err) =>
        showNotification({ color: 'red', message: `Error flushing transcript: ${normalizeErrorString(err)}` })
      );
  }, [stop, debouncedFlush]);

  const handleToggleExpanded = useCallback((): void => {
    setExpanded((prev) => !prev);
  }, []);

  useEffect(() => {
    if (isStopping && !isConnecting && !isRecording) {
      setIsStopping(false);
    }
  }, [isStopping, isProcessing, isConnecting, isRecording]);

  // Track the questionnaire prop
  useEffect(() => {
    if (typeof props.questionnaire === 'object' && 'resourceType' in props.questionnaire) {
      questionnaireRef.current = props.questionnaire;
    }
  }, [props.questionnaire]);

  const isActive = isRecording && !isStopping;
  const isButtonLoading = isConnecting || isStopping;
  const showStopButton = isActive && !isButtonLoading;
  const showButtonLoader = isButtonLoading;

  let dictationLabel = 'Start Dictation';
  if (isStopping) {
    dictationLabel = 'Stopping…';
  } else if (isConnecting) {
    dictationLabel = 'Starting…';
  } else if (showStopButton) {
    dictationLabel = 'Stop Dictation';
  }
  
  let activeStatusLabel: string | undefined;
  if (isProcessing || isStopping) {
    activeStatusLabel = 'Processing…';
  } else if (isRecording) {
    activeStatusLabel = 'Listening…';
  }

  const afterHeader = (
    <Box className={classes.banner}>
      <Flex align="center" justify="space-between" gap="sm" p="md" className={classes.headerRow}>
        <div className={classes.statusRow} data-state={activeStatusLabel ? 'recording' : 'idle'}>
          <span className={classes.iconWrapper} aria-hidden>
            {activeStatusLabel ? <IconCircleFilled size={16} /> : <IconMicrophone size={20} />}
          </span>
          <span className={classes.statusLabel} aria-live="polite">
            {activeStatusLabel ? <span className={classes.statusLabelPrimary}>{activeStatusLabel}</span> : idleLabel}
          </span>
        </div>
        <Flex align="center" gap="xs">
          <Button
            className={cx(classes.dictationButton, showButtonLoader && classes.dictationButtonLoading)}
            variant={showStopButton ? 'light' : 'filled'}
            color={showStopButton ? 'red' : 'blue'}
            size="sm"
            leftSection={showButtonLoader ? <Loader size={14} color="dimmed" /> : undefined}
            disabled={showButtonLoader || (!isVoiceEnabled && !showStopButton)}
            onClick={showStopButton ? handleStopDictation : handleStartDictation}
          >
            {dictationLabel}
          </Button>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            aria-label={expanded ? 'Collapse transcript' : 'Expand transcript'}
            aria-expanded={expanded}
            onClick={handleToggleExpanded}
          >
            {expanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
          </ActionIcon>
        </Flex>
      </Flex>
      <Collapse in={expanded}>
        <Box px="md">
          <Divider color="var(--mantine-color-gray-2)" />
        </Box>
        <Box p="md">
          <div className={classes.panelGrid}>
            <div className={classes.panelColumn}>
              <Text size="sm" fw={700}>
                How to Use
              </Text>
              <div className={classes.instructions}>{voiceInstructions ?? DEFAULT_INSTRUCTIONS}</div>
            </div>
            <div className={classes.panelColumn}>
              <Text size="sm" fw={700}>
                Transcript
              </Text>
              <div className={classes.transcriptWrapper}>
                <div ref={transcriptViewportRef} className={classes.transcriptArea}>
                  <Text component="pre" className={classes.transcriptText}>
                    {transcript || TRANSCRIPT_PLACEHOLDER}
                  </Text>
                </div>
              </div>
            </div>
          </div>
        </Box>
      </Collapse>
    </Box>
  );

  return (
    <QuestionnaireForm
      key={responseVersion}
      {...questionnaireFormProps}
      questionnaireResponse={questionnaireResponse}
      afterHeader={afterHeader}
      onChange={(response) => {
        setQuestionnaireResponse(response);
        props.onChange?.(response);
      }}
    />
  );
}
