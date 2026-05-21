// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Collapse, Divider, Flex, Loader, Stack, Text } from '@mantine/core';
import { IconCircleFilled, IconMicrophone } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import classes from './VoiceInputBanner.module.css';

export interface VoiceInputBannerProps {
  /** When false, dictation controls are disabled. */
  readonly isVoiceEnabled?: boolean;
  /** When true, the session is connecting (mic permission / websocket). */
  readonly isConnecting?: boolean;
  /** When true, the user is actively recording (not merely connecting). */
  readonly isRecording?: boolean;
  /** When true, the AI is processing the latest transcript. */
  readonly isProcessing?: boolean;
  /** When true, dictation is stopping; button shows a loader until idle. */
  readonly isStopping?: boolean;
  /** Current transcript text to display in the expanded panel. */
  readonly transcript?: string;
  /** Optional custom instructions content. Falls back to a generic message. */
  readonly instructions?: ReactNode;
  /** Label shown when voice input is idle. */
  readonly idleLabel?: string;
  /** Invoked when the user clicks Start Dictation. */
  readonly onStartDictation?: () => void;
  /** Invoked when the user clicks Stop Dictation. */
  readonly onStopDictation?: () => void;
  /** Controlled expanded state for the details panel. Lift state above form remounts. */
  readonly expanded?: boolean;
  /** Called when the details panel is opened or closed. */
  readonly onExpandedChange?: (expanded: boolean) => void;
}

const DEFAULT_INSTRUCTIONS = (
  <Stack gap="xs">
    <Text>
      To fill out the form, just speak naturally and the dictation tool will map your spoken answers to the form fields.
    </Text>
    <Text>Pause briefly between thoughts to start processing.</Text>
  </Stack>
);

const TRANSCRIPT_PLACEHOLDER = 'Start speaking to see your transcribed words...';

export function VoiceInputBanner(props: VoiceInputBannerProps): JSX.Element {
  const {
    isVoiceEnabled = true,
    isConnecting = false,
    isRecording = false,
    isProcessing = false,
    isStopping = false,
    transcript = '',
    instructions,
    idleLabel = 'Start Dictation to complete this form with your voice',
    onStartDictation,
    onStopDictation,
    expanded: expandedProp,
    onExpandedChange,
  } = props;

  const [internalExpanded, setInternalExpanded] = useState(false);
  const transcriptViewportRef = useRef<HTMLDivElement>(null);
  const isExpandedControlled = expandedProp !== undefined;
  const expanded = isExpandedControlled ? expandedProp : internalExpanded;

  // Auto-scroll the transcript area to the latest text as it streams in.
  useEffect(() => {
    const viewport = transcriptViewportRef.current;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [transcript]);

  const setExpanded = useCallback(
    (value: boolean): void => {
      if (!isExpandedControlled) {
        setInternalExpanded(value);
      }
      onExpandedChange?.(value);
    },
    [isExpandedControlled, onExpandedChange]
  );

  const handleStartDictation = useCallback((): void => {
    setExpanded(true);
    onStartDictation?.();
  }, [onStartDictation, setExpanded]);

  const handleStopDictation = useCallback((): void => {
    setExpanded(false);
    onStopDictation?.();
  }, [onStopDictation, setExpanded]);

  const isListening = (isRecording || isProcessing) && !isStopping;
  const isButtonLoading = isConnecting || isStopping;
  const isButtonProcessing = isProcessing && !isStopping;
  const showStopButton = isRecording && !isButtonProcessing && !isButtonLoading;
  const showButtonLoader = isButtonLoading || isButtonProcessing;

  let dictationLabel = 'Start Dictation';
  if (isStopping) {
    dictationLabel = 'Stopping…';
  } else if (isConnecting) {
    dictationLabel = 'Starting…';
  } else if (isButtonProcessing) {
    dictationLabel = 'Processing…';
  } else if (showStopButton) {
    dictationLabel = 'Stop Dictation';
  }

  return (
    <Box className={classes.banner}>
      <Flex align="center" justify="space-between" gap="sm" p="md" className={classes.headerRow}>
        <div className={classes.statusRow} data-state={isListening ? 'recording' : 'idle'}>
          <span className={classes.iconWrapper} aria-hidden>
            {isListening ? <IconCircleFilled size={16} /> : <IconMicrophone size={20} />}
          </span>
          <span className={classes.statusLabel} aria-live="polite">
            {isListening ? <span className={classes.statusLabelPrimary}>Listening…</span> : idleLabel}
          </span>
        </div>
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
              <div className={classes.instructions}>{instructions ?? DEFAULT_INSTRUCTIONS}</div>
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
}
