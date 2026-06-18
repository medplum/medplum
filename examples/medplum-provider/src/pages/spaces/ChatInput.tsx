// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Group, Paper, Select, Stack, Textarea, Tooltip } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { useMedplum, useWhisper } from '@medplum/react';
import { IconMicrophone, IconPlayerStopFilled, IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import type { SpaceModelOption } from '../../utils/spaceModels';

const SILENCE_AUTO_SEND_MS = 1000;

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: (overrideInput?: string) => void;
  loading: boolean;
  models: SpaceModelOption[];
  selectedModel: string;
  onModelChange: (value: string) => void;
  backgroundColor?: string;
}

export function ChatInput({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  loading,
  models,
  selectedModel,
  onModelChange,
  backgroundColor = '#fff',
}: ChatInputProps): JSX.Element {
  const medplum = useMedplum();
  const isVoiceEnabled = medplum.getProject()?.features?.includes('ai-realtime') ?? false;

  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const onSendRef = useRef(onSend);
  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  // Stable handle to the debounced auto-send so onTranscript (defined before autoSend below) can
  // arm it. Assigned in an effect once autoSend exists.
  const autoSendRef = useRef<(() => void) | undefined>(undefined);

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
      onInputChange(next);
      autoSendRef.current?.();
    },
  });

  const autoSend = useDebouncedCallback(() => {
    const pending = inputRef.current.trim();
    stop();
    if (pending) {
      onSendRef.current(pending);
    }
  }, SILENCE_AUTO_SEND_MS);

  useEffect(() => {
    autoSendRef.current = autoSend;
  }, [autoSend]);

  useEffect(() => {
    if (status === 'speech_stopped') {
      autoSend();
    } else if (status === 'speech_started' || status === 'listening') {
      // User resumed talking: cancel the pending send; the next transcript or silence re-arms it.
      autoSend.cancel();
    }
  }, [status, autoSend]);

  const isConnecting = status === 'requesting_microphone' || status === 'connecting' || status === 'connected';
  const isRecording = status === 'listening' || status === 'speech_started' || status === 'speech_stopped';
  const isActive = isConnecting || isRecording;

  const handleVoiceToggle = (): void => {
    if (isActive) {
      autoSend.cancel();
      const pending = inputRef.current.trim();
      stop();
      if (pending) {
        onSend(pending);
      }
    } else {
      start().catch(showErrorNotification);
    }
  };

  let voiceTooltip = 'Start voice input';
  if (!isVoiceEnabled) {
    voiceTooltip = 'Voice input is not enabled in this project. Add the "ai-realtime" feature to enable it.';
  } else if (isActive) {
    voiceTooltip = `Stop voice input (${status})`;
  }

  return (
    <Paper p="md" radius="lg" withBorder style={{ backgroundColor }}>
      <Stack gap="sm">
        <Group gap="md" wrap="nowrap" align="flex-end">
          <Textarea
            placeholder="Ask, search, or make anything..."
            value={input}
            onChange={(e) => onInputChange(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            autosize
            minRows={1}
            maxRows={5}
            style={{ flex: 1 }}
            styles={{
              input: {
                border: 'none',
                backgroundColor: 'transparent',
                fontSize: '15px',
                padding: 0,
                resize: 'none',
              },
            }}
          />
          <Tooltip label={voiceTooltip}>
            <ActionIcon
              aria-label={isActive ? 'Stop voice input' : 'Start voice input'}
              radius="xl"
              size="lg"
              variant="filled"
              color={isRecording ? 'red' : undefined}
              onClick={handleVoiceToggle}
              disabled={loading || isConnecting || !isVoiceEnabled}
              loading={isConnecting}
              data-disabled={!isVoiceEnabled || undefined}
              bg="#7c3aed"
              style={!isVoiceEnabled ? { pointerEvents: 'auto' } : undefined}
            >
              {isRecording ? <IconPlayerStopFilled size={18} /> : <IconMicrophone size={18} />}
            </ActionIcon>
          </Tooltip>
          <Button
            aria-label="Send message"
            radius="xl"
            size="sm"
            onClick={() => onSend()}
            disabled={loading || !input.trim()}
            w="36px"
            h="36px"
            bg="#7c3aed"
            p={0}
          >
            <IconSend size={18} />
          </Button>
        </Group>
        <Select
          size="xs"
          data={models}
          value={selectedModel}
          onChange={(value) => onModelChange(value ?? models[0]?.value)}
          w="170px"
          withCheckIcon={false}
          fw={500}
          pr="md"
          styles={{
            input: {
              fontSize: '12px',
              cursor: 'pointer',
            },
          }}
        />
      </Stack>
    </Paper>
  );
}
