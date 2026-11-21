// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Text, Textarea, Tooltip } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import type { Annotation } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, useWhisper } from '@medplum/react';
import { IconArrowRight, IconCheck, IconCircleFilled, IconMicrophone, IconX } from '@tabler/icons-react';
import type { JSX, KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import classes from '../../pages/spaces/PromptComposer.module.css';
import { showErrorNotification } from '../../utils/notifications';
import noteClasses from './ClaimNoteInput.module.css';

const VOICE_DISABLED_TOOLTIP = 'Voice input is not enabled. Add the "ai-realtime" feature to enable it.';

export interface ClaimNoteInputProps {
  readonly onAdd: (note: Annotation) => void;
  /** Focuses the box when it mounts. */
  readonly autoFocus?: boolean;
}

/**
 * The note box under a claim's activity, built like the Spaces message input: the buttons sit inside the box, and
 * the right-hand button starts voice mode until there is text to add, when it becomes the add button. Enter adds
 * the note; Shift+Enter starts a new line.
 * @param props - The ClaimNoteInput React props.
 * @returns The ClaimNoteInput React node.
 */
export function ClaimNoteInput(props: ClaimNoteInputProps): JSX.Element {
  const { onAdd, autoFocus } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const isVoiceEnabled = medplum.getProject()?.features?.includes('ai-realtime') ?? false;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const textRef = useRef('');
  const voiceSnapshotRef = useRef('');

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  const update = (next: string): void => {
    textRef.current = next;
    setText(next);
  };

  const { start, stop, status } = useWhisper({
    model: 'gpt-4o-transcribe',
    onTranscript: (transcript) => {
      const trimmed = transcript.trim();
      if (trimmed) {
        const previous = textRef.current.trim();
        update(previous ? `${previous} ${trimmed}` : trimmed);
      }
    },
  });
  const isConnecting = status === 'requesting_microphone' || status === 'connecting' || status === 'connected';
  const isRecording = status === 'listening' || status === 'speech_started' || status === 'speech_stopped';
  const isVoice = isConnecting || isRecording;

  const add = (): void => {
    const trimmed = textRef.current.trim();
    if (!trimmed) {
      return;
    }
    onAdd({
      text: trimmed,
      time: new Date().toISOString(),
      authorString: profile ? getDisplayString(profile) : 'You',
    });
    update('');
  };

  const startVoice = (): void => {
    voiceSnapshotRef.current = textRef.current;
    start().catch(showErrorNotification);
  };

  const acceptVoice = (): void => {
    stop();
    textareaRef.current?.focus();
  };

  const cancelVoice = (): void => {
    stop();
    update(voiceSnapshotRef.current);
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (isVoice) {
        acceptVoice();
      }
      add();
    }
  };

  let action: JSX.Element;
  if (text.trim()) {
    action = (
      <Tooltip label="Add Note" position="top" openDelay={100}>
        <ActionIcon
          onClick={add}
          size={32}
          radius="xl"
          color="blue"
          variant="filled"
          className={classes.sendActionButton}
          aria-label="Add Note"
        >
          <IconArrowRight size={16} stroke={2} />
        </ActionIcon>
      </Tooltip>
    );
  } else {
    action = (
      <Tooltip label={isVoiceEnabled ? 'Voice Mode' : VOICE_DISABLED_TOOLTIP} position="top" openDelay={100}>
        <ActionIcon
          onClick={startVoice}
          size={32}
          radius="xl"
          color="dark"
          variant="subtle"
          className={classes.subtleActionButton}
          aria-label="Start voice mode"
          disabled={!isVoiceEnabled}
          data-disabled={!isVoiceEnabled || undefined}
          style={isVoiceEnabled ? undefined : { pointerEvents: 'auto' }}
        >
          <IconMicrophone size={16} stroke={2} />
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <div
      className={`${classes.chatInputBox} ${noteClasses.box}`}
      data-voice-active={isVoice || undefined}
      onMouseDown={(e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!(target instanceof HTMLTextAreaElement) && !target.closest('button')) {
          e.preventDefault();
          textareaRef.current?.focus();
        }
      }}
    >
      <Textarea
        ref={textareaRef}
        placeholder={isVoice ? 'Start speaking—your transcribed words will appear here.' : 'Add a note...'}
        value={text}
        onChange={(e) => update(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        autosize
        minRows={2}
        maxRows={8}
        classNames={{ input: `${classes.chatTextarea} ${noteClasses.textarea}` }}
      />
      {!isVoice && <div className={noteClasses.inlineAction}>{action}</div>}
      {isVoice && (
        <div className={classes.chatActionBar}>
          <div className={classes.listeningStatus} data-state={isRecording ? 'recording' : 'connecting'}>
            <span className={classes.listeningDotWrapper} aria-hidden>
              <IconCircleFilled size={16} />
            </span>
            <Text fz="xs" fw={400} ml={2} className={classes.listeningLabel} aria-live="polite">
              {isRecording ? 'Listening…' : 'Connecting…'}
            </Text>
          </div>
          <Group gap={8}>
            <Tooltip label="Cancel" position="top" openDelay={100}>
              <ActionIcon
                onClick={cancelVoice}
                size={32}
                radius="xl"
                color="dark"
                variant="subtle"
                className={classes.subtleActionButton}
                aria-label="Cancel voice input"
              >
                <IconX size={16} stroke={2} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Accept" position="top" openDelay={100}>
              <ActionIcon
                onClick={acceptVoice}
                size={32}
                radius="xl"
                color="blue"
                variant="filled"
                aria-label="Accept voice input"
              >
                <IconCheck size={16} stroke={2} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </div>
      )}
    </div>
  );
}
