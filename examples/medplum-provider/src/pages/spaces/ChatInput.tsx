// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Group, Paper, Select, Stack, Textarea, Tooltip } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { IconMicrophone, IconPlayerStopFilled, IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { useWhisper } from '../../hooks/useWhisper';
import { showErrorNotification } from '../../utils/notifications';

const MODEL_GPT_5_MINI = 'gpt-5-mini';
const MODEL_GPT_5_4 = 'gpt-5.4';
const MODEL_GPT_5_5 = 'gpt-5.5';

export const DEFAULT_MODEL = MODEL_GPT_5_5;

const SILENCE_AUTO_SEND_MS = 1000;

const MODELS = [
  { value: MODEL_GPT_5_MINI, label: 'GPT-5 Mini' },
  { value: MODEL_GPT_5_4, label: 'GPT-5.4' },
  { value: MODEL_GPT_5_5, label: 'GPT-5.5' },
];

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: (overrideInput?: string) => void;
  loading: boolean;
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
    },
  });

  useEffect(() => {
    if (status !== 'speech_stopped') {
      return undefined;
    }
    const timer = setTimeout(() => {
      const pending = inputRef.current.trim();
      stop();
      if (pending) {
        onSendRef.current(pending);
      }
    }, SILENCE_AUTO_SEND_MS);
    return () => clearTimeout(timer);
  }, [status, stop]);

  const isConnecting = status === 'requesting_microphone' || status === 'connecting' || status === 'connected';
  const isRecording = status === 'listening' || status === 'speech_started' || status === 'speech_stopped';
  const isActive = isConnecting || isRecording;

  const handleVoiceToggle = (): void => {
    if (isActive) {
      stop();
    } else {
      start().catch((err) => showErrorNotification(err));
    }
  };

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
          {isVoiceEnabled && (
            <Tooltip label={isActive ? `Stop voice input (${status})` : 'Start voice input'}>
              <ActionIcon
                aria-label={isActive ? 'Stop voice input' : 'Start voice input'}
                radius="xl"
                size="lg"
                variant="filled"
                color={isRecording ? 'red' : undefined}
                bg={isRecording || isConnecting ? undefined : '#7c3aed'}
                onClick={handleVoiceToggle}
                disabled={loading || isConnecting}
                loading={isConnecting}
              >
                {isRecording ? <IconPlayerStopFilled size={18} /> : <IconMicrophone size={18} />}
              </ActionIcon>
            </Tooltip>
          )}
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
          data={MODELS}
          value={selectedModel}
          onChange={(value) => onModelChange(value ?? DEFAULT_MODEL)}
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
