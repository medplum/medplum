// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, Textarea, Select, Button, Group, Stack } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';

const MODEL_GPT_5_MINI = 'gpt-5-mini';
const MODEL_GPT_5_2 = 'gpt-5.2';

export const DEFAULT_MODEL = MODEL_GPT_5_MINI;

const MODELS = [
  { value: MODEL_GPT_5_MINI, label: 'GPT-5 Mini' },
  { value: MODEL_GPT_5_2, label: 'GPT-5.2' },
];

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
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
          <Button
            aria-label="Send message"
            radius="xl"
            size="sm"
            onClick={onSend}
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
