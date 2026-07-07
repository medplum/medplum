// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Badge,
  Box,
  Center,
  Code,
  Collapse,
  Group,
  Loader,
  ScrollArea,
  SegmentedControl,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { formatDateTime, getExtension, normalizeErrorString } from '@medplum/core';
import type { AuditEvent, Bot } from '@medplum/fhirtypes';
import { MedplumLink, useMedplum } from '@medplum/react';
import { IconExternalLink, IconRefresh, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const DURATION_EXTENSION_URL = 'https://medplum.com/fhir/StructureDefinition/durationMs';

type StatusFilter = 'all' | 'success' | 'error';

interface LogStatus {
  label: string;
  color: string;
  isError: boolean;
}

/**
 * Maps a FHIR AuditEvent.outcome code to a display status. Bot executions record
 * '0' on success and the failure codes ('4'/'8'/'12') otherwise.
 * @param outcome - The AuditEvent.outcome code.
 * @returns The display status.
 */
function getLogStatus(outcome: string | undefined): LogStatus {
  switch (outcome) {
    case '0':
      return { label: 'Success', color: 'green', isError: false };
    case '4':
      return { label: 'Minor', color: 'yellow', isError: true };
    case '8':
      return { label: 'Serious', color: 'orange', isError: true };
    case '12':
      return { label: 'Major', color: 'red', isError: true };
    default:
      return { label: 'Unknown', color: 'gray', isError: false };
  }
}

/**
 * Computes the execution duration of a bot AuditEvent in milliseconds. Prefers
 * the explicit durationMs extension and falls back to the recorded period.
 * @param auditEvent - The AuditEvent.
 * @returns The duration in milliseconds, or undefined if it cannot be determined.
 */
function getDurationMs(auditEvent: AuditEvent): number | undefined {
  const ext = getExtension(auditEvent, DURATION_EXTENSION_URL);
  if (typeof ext?.valueInteger === 'number') {
    return ext.valueInteger;
  }
  const start = auditEvent.period?.start;
  const end = auditEvent.period?.end;
  if (start && end) {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return ms >= 0 ? ms : undefined;
  }
  return undefined;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) {
    return '—';
  }
  if (ms < 1000) {
    return `${ms} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

export interface BotLogsPanelProps {
  readonly bot: Bot;
}

/**
 * A Supabase-inspired logs viewer for a Bot's execution history. Bot executions
 * are recorded as AuditEvents whose `outcomeDesc` holds the console output, so we
 * surface them here as a filterable, expandable log stream.
 * @param props - The panel props.
 * @returns The logs panel.
 */
export function BotLogsPanel(props: BotLogsPanelProps): JSX.Element {
  const { bot } = props;
  const medplum = useMedplum();
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | undefined>();

  const botId = bot.id;

  const loadLogs = useCallback(async () => {
    if (!botId) {
      return;
    }
    try {
      const bundle = await medplum.searchResources('AuditEvent', {
        entity: `Bot/${botId}`,
        _sort: '-_lastUpdated',
        _count: '100',
      });
      setLogs(bundle);
    } catch (err) {
      console.error(normalizeErrorString(err));
    } finally {
      setLoading(false);
    }
  }, [medplum, botId]);

  useEffect(() => {
    setLoading(true);
    loadLogs().catch(console.error);
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      const status = getLogStatus(log.outcome);
      if (statusFilter === 'success' && status.isError) {
        return false;
      }
      if (statusFilter === 'error' && !status.isError) {
        return false;
      }
      if (q && !(log.outcomeDesc ?? '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [logs, statusFilter, query]);

  return (
    <Box>
      <Group justify="space-between" mb="sm" gap="sm" wrap="nowrap">
        <TextInput
          flex={1}
          size="xs"
          placeholder="Filter logs by message…"
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <SegmentedControl
          size="xs"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          data={[
            { label: 'All', value: 'all' },
            { label: 'Success', value: 'success' },
            { label: 'Errors', value: 'error' },
          ]}
        />
        <Tooltip label="Refresh">
          <ActionIcon variant="subtle" size="sm" onClick={() => loadLogs().catch(console.error)}>
            <IconRefresh size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Box
        style={{
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 'var(--mantine-radius-sm)',
          overflow: 'hidden',
        }}
      >
        {/* Column header */}
        <Group
          gap={0}
          px="sm"
          py={6}
          wrap="nowrap"
          style={{
            background: 'var(--mantine-color-default)',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Text size="xs" fw={600} c="dimmed" w={90} style={{ flexShrink: 0 }}>
            STATUS
          </Text>
          <Text size="xs" fw={600} c="dimmed" w={190} style={{ flexShrink: 0 }}>
            TIMESTAMP
          </Text>
          <Text size="xs" fw={600} c="dimmed" w={90} style={{ flexShrink: 0 }}>
            DURATION
          </Text>
          <Text size="xs" fw={600} c="dimmed" flex={1}>
            MESSAGE
          </Text>
        </Group>

        <ScrollArea.Autosize mah={420}>
          {loading && (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          )}
          {!loading && filteredLogs.length === 0 && (
            <Text size="sm" c="dimmed" p="md" ta="center">
              No log entries{logs.length > 0 ? ' match the current filters' : ' yet for this bot'}.
            </Text>
          )}
          {!loading &&
            filteredLogs.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                expanded={expandedId === log.id}
                onToggle={() => setExpandedId((cur) => (cur === log.id ? undefined : log.id))}
              />
            ))}
        </ScrollArea.Autosize>
      </Box>
    </Box>
  );
}

interface LogRowProps {
  readonly log: AuditEvent;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

function LogRow({ log, expanded, onToggle }: LogRowProps): JSX.Element {
  const status = getLogStatus(log.outcome);
  const timestamp = log.period?.start ?? log.recorded;
  const message = log.outcomeDesc?.trim() || '(no output)';
  const firstLine = message.split('\n')[0];

  return (
    <Box
      style={{
        borderBottom: '1px solid var(--mantine-color-default-border)',
        background: expanded ? 'var(--mantine-color-default-hover)' : undefined,
      }}
    >
      <Group
        gap={0}
        px="sm"
        py={6}
        wrap="nowrap"
        style={{ cursor: 'pointer' }}
        onClick={onToggle}
      >
        <Box w={90} style={{ flexShrink: 0 }}>
          <Badge size="xs" variant="light" color={status.color}>
            {status.label}
          </Badge>
        </Box>
        <Text size="xs" c="dimmed" w={190} style={{ flexShrink: 0 }} ff="monospace">
          {formatDateTime(timestamp)}
        </Text>
        <Text size="xs" c="dimmed" w={90} style={{ flexShrink: 0 }} ff="monospace">
          {formatDuration(getDurationMs(log))}
        </Text>
        <Text size="xs" flex={1} truncate ff="monospace" c={status.isError ? 'red' : undefined}>
          {firstLine}
        </Text>
      </Group>
      <Collapse in={expanded}>
        <Box px="sm" pb="sm">
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed" fw={600}>
              OUTPUT
            </Text>
            {log.id && (
              <MedplumLink to={`/AuditEvent/${log.id}`}>
                <Group gap={4}>
                  <Text size="xs">Open AuditEvent</Text>
                  <IconExternalLink size={12} />
                </Group>
              </MedplumLink>
            )}
          </Group>
          <Code block style={{ maxHeight: 300, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {message}
          </Code>
        </Box>
      </Collapse>
    </Box>
  );
}
