// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Anchor,
  Avatar,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  formatDateTime,
  isNotFound,
  isOperationOutcome,
  normalizeErrorString,
  OperationOutcomeError,
} from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { EventDetailLevel, GoogleCalendarStatus } from '../../utils/googleCalendar';
import {
  disconnectGoogleCalendar,
  EVENT_DETAIL_LEVEL_LABELS,
  EVENT_DETAIL_LEVELS,
  getGoogleCalendarClientId,
  getGoogleCalendarStatus,
  isEventDetailLevel,
  startGoogleCalendarAuth,
  syncGoogleCalendar,
  updateGoogleCalendarDetailLevel,
} from '../../utils/googleCalendar';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

const DEFAULT_DISCONNECT_WARNING =
  'Disconnecting removes the busy blocks imported from Google Calendar, so those times can become bookable again. Events this app added to Google Calendar are removed.';

const DETAIL_OPTIONS = EVENT_DETAIL_LEVELS.map((level) => ({ value: level, label: EVENT_DETAIL_LEVEL_LABELS[level] }));

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'not-installed' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly status: GoogleCalendarStatus };

function isNotFoundError(err: unknown): boolean {
  if (err instanceof OperationOutcomeError) {
    return isNotFound(err.outcome);
  }
  return isOperationOutcome(err) && isNotFound(err);
}

function formatInstant(value: string | undefined): string {
  return value ? formatDateTime(value) : 'Never';
}

function statusBadge(status: GoogleCalendarStatus): JSX.Element {
  if (!status.connected) {
    return <Badge color="gray">Not connected</Badge>;
  }
  if (status.status === 'reauth-required') {
    return <Badge color="red">Reconnect required</Badge>;
  }
  if (status.status === 'disconnecting') {
    return <Badge color="yellow">Disconnecting</Badge>;
  }
  if (status.stale) {
    return <Badge color="yellow">Out of date</Badge>;
  }
  return <Badge color="green">Connected</Badge>;
}

export function GoogleCalendarPage(): JSX.Element {
  const medplum = useMedplum();
  const clientId = getGoogleCalendarClientId();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [detailLevel, setDetailLevel] = useState<EventDetailLevel>('busy-only');
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const status = await getGoogleCalendarStatus(medplum);
      setLoad({ kind: 'ready', status });
      if (isEventDetailLevel(status.eventDetailLevel)) {
        setDetailLevel(status.eventDetailLevel);
      }
    } catch (err) {
      setLoad(isNotFoundError(err) ? { kind: 'not-installed' } : { kind: 'error', message: normalizeErrorString(err) });
    }
  }, [medplum]);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  async function run(action: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    try {
      await action();
      showSuccessNotification({ message: success });
      await refresh();
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setBusy(false);
    }
  }

  async function connect(): Promise<void> {
    if (!clientId) {
      return;
    }
    setBusy(true);
    try {
      window.location.assign(await startGoogleCalendarAuth(clientId, detailLevel));
    } catch (err) {
      setBusy(false);
      showErrorNotification(err);
    }
  }

  const status = load.kind === 'ready' ? load.status : undefined;
  const connected = status?.connected === true;
  const needsConsent = !connected || status?.status === 'reauth-required';
  const disconnecting = status?.status === 'disconnecting';

  return (
    <Stack maw={720} mx="auto" my="xl" px="md" gap="lg">
      <Anchor component={Link} to="/integrations" size="sm">
        &larr; Integrations
      </Anchor>
      <Group wrap="nowrap">
        <Avatar src="/img/integrations/google.png" size={48} radius="md" />
        <div>
          <Title order={2}>Google Calendar</Title>
          <Text c="dimmed" size="sm">
            Your appointments appear on your Google Calendar, and Busy time on Google Calendar blocks those times in
            Medplum scheduling.
          </Text>
        </div>
      </Group>

      {load.kind === 'loading' && <Loader />}

      {load.kind === 'not-installed' && (
        <Alert color="yellow" icon={<IconAlertCircle />} title="Google Calendar sync is not installed">
          This project does not have the Google Calendar sync operations, or your access policy cannot see them. A
          project administrator installs them from the Google Calendar sync example
          (examples/medplum-google-calendar-sync).
        </Alert>
      )}

      {load.kind === 'error' && (
        <Alert color="red" icon={<IconAlertCircle />} title="Could not load Google Calendar status">
          {load.message}
        </Alert>
      )}

      {status && (
        <Paper withBorder radius="md" p="lg">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={700}>{status.email ?? 'Google account'}</Text>
              {statusBadge(status)}
            </Group>

            {status.status === 'reauth-required' && (
              <Alert color="red" icon={<IconAlertCircle />}>
                Google no longer accepts this connection. Reconnect to resume syncing.
              </Alert>
            )}
            {status.privacyCleanupPending && (
              <Alert color="blue">
                Removing details from events already on Google Calendar. This can take a while.
              </Alert>
            )}
            {(status.activeConflictCount ?? 0) > 0 && (
              <Alert color="orange" icon={<IconAlertCircle />} title="Appointments overlap Google Calendar busy time">
                {status.conflicts.map((c) => (
                  <Text key={c.key} size="sm">
                    <Anchor component={Link} to={`/${c.appointment.reference}`}>
                      {c.appointment.display ?? c.appointment.reference}
                    </Anchor>{' '}
                    {formatDateTime(c.start)} &ndash; {formatDateTime(c.end)}
                  </Text>
                ))}
              </Alert>
            )}

            {connected && (
              <Table>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>Last import from Google</Table.Td>
                    <Table.Td>
                      {formatInstant(status.lastSuccessfulInbound)}
                      {status.inboundPending ? ' (update pending)' : ''}
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>Last update to Google</Table.Td>
                    <Table.Td>
                      {formatInstant(status.lastSuccessfulOutbound)}
                      {status.outboundPending ? ' (update pending)' : ''}
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>Details shown on Google</Table.Td>
                    <Table.Td>
                      {isEventDetailLevel(status.effectiveDetailLevel)
                        ? EVENT_DETAIL_LEVEL_LABELS[status.effectiveDetailLevel]
                        : (status.effectiveDetailLevel ?? 'Unknown')}
                    </Table.Td>
                  </Table.Tr>
                  {status.stale && status.staleReason && (
                    <Table.Tr>
                      <Table.Td>Sync issue</Table.Td>
                      <Table.Td>{status.staleReason}</Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            )}

            <Select
              label="Event details on Google Calendar"
              description="Patients are never added as guests. The project setting can limit this further."
              data={DETAIL_OPTIONS}
              value={detailLevel}
              onChange={(v) => isEventDetailLevel(v) && setDetailLevel(v)}
              allowDeselect={false}
              disabled={busy || disconnecting}
            />

            {needsConsent && !clientId && (
              <Alert color="yellow" icon={<IconAlertCircle />}>
                Set GOOGLE_CALENDAR_CLIENT_ID to the Google OAuth client ID installed in this project to connect from
                this app.
              </Alert>
            )}

            <Group>
              {needsConsent && (
                <Button onClick={() => connect()} loading={busy} disabled={!clientId || disconnecting}>
                  {connected ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
                </Button>
              )}
              {connected && !disconnecting && (
                <>
                  <Button
                    variant="default"
                    disabled={busy || detailLevel === status.eventDetailLevel}
                    onClick={() =>
                      run(() => updateGoogleCalendarDetailLevel(medplum, detailLevel), 'Event detail setting saved')
                    }
                  >
                    Save detail setting
                  </Button>
                  <Button
                    variant="default"
                    disabled={busy}
                    onClick={() => run(() => syncGoogleCalendar(medplum), 'Sync to Google Calendar queued')}
                  >
                    Sync now
                  </Button>
                  <Button color="red" variant="outline" disabled={busy} onClick={() => setConfirmDisconnect(true)}>
                    Disconnect
                  </Button>
                </>
              )}
              <Button variant="subtle" disabled={busy} onClick={() => refresh()}>
                Refresh
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}

      <Modal opened={confirmDisconnect} onClose={() => setConfirmDisconnect(false)} title="Disconnect Google Calendar?">
        <Stack>
          <Text size="sm">{status?.disconnectWarning ?? DEFAULT_DISCONNECT_WARNING}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmDisconnect(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                setConfirmDisconnect(false);
                run(() => disconnectGoogleCalendar(medplum), 'Disconnect started').catch(console.error);
              }}
            >
              Disconnect
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
