// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Badge, Button, Group, Stack, Text, Textarea, Title, Tooltip } from '@mantine/core';
import type { DiagnosticReport, Task } from '@medplum/fhirtypes';
import { Loading, useMedplum, useWhisper } from '@medplum/react';
import { IconMicrophone, IconPlayerStopFilled } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { showErrorNotification } from '../utils/notifications';

export interface ReportCreatorProps {
  readonly task: Task;
  readonly report: DiagnosticReport;
}

export function ReportCreator({ task, report }: ReportCreatorProps): JSX.Element {
  const medplum = useMedplum();
  const isVoiceEnabled = medplum.getProject()?.features?.includes('ai-realtime') ?? false;
  const [text, setText] = useState(report.conclusion ?? '');
  const [saving, setSaving] = useState(false);

  const { start, stop, status, isListening } = useWhisper({
    model: 'gpt-4o-transcribe',
    onTranscript: (transcript) => {
      const trimmed = transcript.trim();
      if (!trimmed) {
        return;
      }
      setText((previous) => (previous.trim() ? `${previous.trim()} ${trimmed}` : trimmed));
    },
  });

  // `stop()` leaves the socket warm and parks the hook at 'idle', which is also its resting state
  // before the first `start()`. So the button has to track the states where audio is actually being
  // captured or set up — never the absence of a terminal state.
  const isConnecting = status === 'requesting_microphone' || status === 'connecting' || status === 'connected';
  const isActive = isConnecting || isListening;

  const save = (status: DiagnosticReport['status']): void => {
    setSaving(true);
    medplum
      .updateResource<DiagnosticReport>({ ...report, status, conclusion: text })
      .catch(showErrorNotification)
      .finally(() => setSaving(false));
  };

  if (!report.id) {
    return <Loading />;
  }

  return (
    <Stack p="md" gap="sm" style={{ flex: 1, minHeight: 0 }}>
      <Group justify="space-between">
        <div>
          <Title order={4}>{task.code?.text ?? 'Radiology report'}</Title>
          <Text size="xs" c="dimmed">
            {task.description}
          </Text>
        </div>
        <Badge variant="light" color={report.status === 'final' ? 'green' : 'gray'}>
          {report.status}
        </Badge>
      </Group>

      <Group gap="xs">
        <Tooltip
          label={isVoiceEnabled ? 'Dictate findings' : 'Voice input is not enabled. Add the "ai-realtime" feature.'}
        >
          <ActionIcon
            variant={isActive ? 'filled' : 'light'}
            color={isActive ? 'red' : 'blue'}
            disabled={!isVoiceEnabled}
            aria-label={isActive ? 'Stop dictation' : 'Start dictation'}
            onClick={() => (isActive ? stop() : start().catch(showErrorNotification))}
          >
            {isActive ? <IconPlayerStopFilled size={16} /> : <IconMicrophone size={16} />}
          </ActionIcon>
        </Tooltip>
        {isActive && (
          <Text size="xs" c="dimmed">
            {isListening ? 'Listening…' : 'Connecting…'}
          </Text>
        )}
      </Group>

      <Textarea
        aria-label="Report findings"
        placeholder="Dictate or type the findings…"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        autosize
        minRows={12}
        styles={{ wrapper: { flex: 1 } }}
      />

      <Group>
        <Button variant="default" loading={saving} onClick={() => save('preliminary')}>
          Save draft
        </Button>
        <Button loading={saving} disabled={!text.trim()} onClick={() => save('final')}>
          Sign report
        </Button>
      </Group>
    </Stack>
  );
}
