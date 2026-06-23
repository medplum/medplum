// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Button,
  Checkbox,
  Code,
  Divider,
  Group,
  Modal,
  NumberInput,
  Table,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import type { AgentChannelStats, AgentStats } from '@medplum/core';
import { ContentType, fetchLatestVersionString, formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Agent, Bundle, Parameters, Reference } from '@medplum/fhirtypes';
import { Document, Form, Loading, ResourceName, StatusBadge, useMedplum } from '@medplum/react';
import { IconCheck, IconRouter } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';

type UpgradeConfirmContentProps = {
  readonly opened: boolean;
  readonly close: () => void;
  readonly version: string | undefined;
  readonly loadingStatus: boolean;
  readonly handleStatus: () => void;
  readonly handleUpgrade: (force: boolean) => void;
};

function UpgradeConfirmContent(props: UpgradeConfirmContentProps): JSX.Element {
  const { opened, close, version, loadingStatus, handleStatus, handleUpgrade } = props;

  const [latestVersionString, setLatestVersionString] = useState<string>();
  const [shouldForceUpgrade, setShouldForceUpgrade] = useState(false);

  useEffect(() => {
    if (opened) {
      if (!latestVersionString) {
        fetchLatestVersionString('app-tools-page').then(setLatestVersionString).catch(console.error);
      }
      handleStatus();
    }
  }, [opened, latestVersionString, handleStatus]);

  // If we don't have the latest version string
  // The current agent version
  // Or if we are still loading something
  // Show loading
  if (!(latestVersionString && version && !loadingStatus)) {
    return <Loading />;
  }

  if (version === 'unknown') {
    return <p>Unable to determine the current version of the agent. Check the network connectivity of the agent.</p>;
  }

  if (version.startsWith(latestVersionString)) {
    return <p>This agent is already on the latest version ({latestVersionString}).</p>;
  }

  return (
    <>
      <p>
        Are you sure you want to upgrade this agent from version {version} to version {latestVersionString}?
      </p>
      <Group>
        <Button
          onClick={() => {
            handleUpgrade(shouldForceUpgrade);
            close();
          }}
          aria-label="Confirm upgrade"
        >
          Confirm Upgrade
        </Button>
        <Checkbox label="Force" onChange={(e) => setShouldForceUpgrade(e.currentTarget.checked)} />
      </Group>
    </>
  );
}

const SUMMARY_STAT_KEYS = [
  'live',
  'ping',
  'hl7ConnectionsOpen',
  'hl7ClientCount',
  'hl7QueueDepth',
  'webSocketQueueDepth',
  'outstandingHeartbeats',
] as const satisfies readonly (keyof AgentStats)[];

function formatStatValue(value: Record<string, unknown> | boolean | number | string): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  return value.toString();
}

function AgentChannelStatsTable(props: {
  readonly title: string;
  readonly entries: Record<string, AgentChannelStats>;
}): JSX.Element | null {
  const names = Object.keys(props.entries).filter((name) => props.entries[name]?.rtt);
  if (!names.length) {
    return null;
  }
  return (
    <>
      <Title order={3} mt="md">
        {props.title}
      </Title>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Count</Table.Th>
            <Table.Th>Pending</Table.Th>
            <Table.Th>Min (ms)</Table.Th>
            <Table.Th>Avg (ms)</Table.Th>
            <Table.Th>Max (ms)</Table.Th>
            <Table.Th>p50 (ms)</Table.Th>
            <Table.Th>p95 (ms)</Table.Th>
            <Table.Th>p99 (ms)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {names.map((name) => {
            const rtt = props.entries[name].rtt;
            return (
              <Table.Tr key={name}>
                <Table.Td>{name}</Table.Td>
                <Table.Td>{rtt.count}</Table.Td>
                <Table.Td>{rtt.pendingCount}</Table.Td>
                <Table.Td>{rtt.min}</Table.Td>
                <Table.Td>{rtt.average}</Table.Td>
                <Table.Td>{rtt.max}</Table.Td>
                <Table.Td>{rtt.p50}</Table.Td>
                <Table.Td>{rtt.p95}</Table.Td>
                <Table.Td>{rtt.p99}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </>
  );
}

function AgentStatsTables(props: { readonly stats: AgentStats }): JSX.Element {
  const { stats } = props;
  const knownKeys = new Set<string>([...SUMMARY_STAT_KEYS, 'channelStats', 'clientStats']);
  const extraEntries = Object.entries(stats).filter(([key]) => !knownKeys.has(key));

  return (
    <>
      <Table mt="sm">
        <Table.Tbody>
          {SUMMARY_STAT_KEYS.map((key) => (
            <Table.Tr key={key}>
              <Table.Td>{key}</Table.Td>
              <Table.Td>{formatStatValue(stats[key])}</Table.Td>
            </Table.Tr>
          ))}
          {extraEntries.map(([key, value]) => (
            <Table.Tr key={key}>
              <Table.Td>{key}</Table.Td>
              <Table.Td>{formatStatValue(value)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <AgentChannelStatsTable title="Channel Stats" entries={stats.channelStats} />
      <AgentChannelStatsTable title="Client Stats" entries={stats.clientStats} />
    </>
  );
}

export function ToolsPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const reference = useMemo<Reference<Agent>>(() => ({ reference: 'Agent/' + id }), [id]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [reloadingConfig, setReloadingConfig] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [fetchingLogs, setFetchingLogs] = useState(false);
  const [fetchingStats, setFetchingStats] = useState(false);
  const [status, setStatus] = useState<string>();
  const [version, setVersion] = useState<string>();
  const [lastUpdated, setLastUpdated] = useState<string>();
  const [lastPing, setLastPing] = useState<string | undefined>();
  const [pinging, setPinging] = useState(false);
  const [logs, setLogs] = useState<string | undefined>();
  const [stats, setStats] = useState<AgentStats | undefined>();
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  const working = loadingStatus || reloadingConfig || upgrading || pinging || fetchingLogs || fetchingStats;

  const handleStatus = useCallback(() => {
    setLoadingStatus(true);
    medplum
      .get(medplum.fhirUrl('Agent', id, '$status'), { cache: 'reload' })
      .then((result: Parameters) => {
        setStatus(result.parameter?.find((p) => p.name === 'status')?.valueCode);
        setVersion(result.parameter?.find((p) => p.name === 'version')?.valueString);
        setLastUpdated(result.parameter?.find((p) => p.name === 'lastUpdated')?.valueInstant);
      })
      .catch((err) => showError(normalizeErrorString(err)))
      .finally(() => setLoadingStatus(false));
  }, [medplum, id]);

  const handlePing = useCallback(
    (formData: Record<string, string>) => {
      const host = formData.host;
      const pingCount = formData.pingCount || 1;
      if (!host) {
        return;
      }
      setPinging(true);
      medplum
        .pushToAgent(reference, host, `PING ${pingCount}`, ContentType.PING, true)
        .then((pingResult: string) => setLastPing(pingResult))
        .catch((err: unknown) => showError(normalizeErrorString(err)))
        .finally(() => setPinging(false));
    },
    [medplum, reference]
  );

  const handleReloadConfig = useCallback(() => {
    setReloadingConfig(true);
    medplum
      .get(medplum.fhirUrl('Agent', id, '$reload-config'), { cache: 'reload' })
      .then((_result: Bundle<Parameters>) => {
        showSuccess('Agent config reloaded successfully.');
      })
      .catch((err) => showError(normalizeErrorString(err)))
      .finally(() => setReloadingConfig(false));
  }, [medplum, id]);

  const handleUpgrade = useCallback(
    (force: boolean) => {
      setUpgrading(true);
      const upgradeUrl = medplum.fhirUrl('Agent', id, '$upgrade');
      upgradeUrl.searchParams.set('force', String(force));
      medplum
        .get(upgradeUrl, { cache: 'reload' })
        .then((_result: Bundle<Parameters>) => {
          showSuccess('Agent upgraded successfully.');
        })
        .catch((err) => showError(normalizeErrorString(err)))
        .finally(() => setUpgrading(false));
    },
    [medplum, id]
  );

  const handleFetchLogs = useCallback(
    (formData: Record<string, string>) => {
      setFetchingLogs(true);
      const limit = formData.logLimit || 20;
      medplum
        .get(medplum.fhirUrl('Agent', id, `$fetch-logs${limit !== undefined ? `?limit=${limit}` : ''}`), {
          cache: 'reload',
        })
        .then((result: Parameters) => {
          const param = result?.parameter?.find((param) => param.name === 'logs');
          if (param) {
            setLogs(param?.valueString);
          }
        })
        .catch((err) => showError(normalizeErrorString(err)))
        .finally(() => setFetchingLogs(false));
    },
    [medplum, id]
  );

  const handleFetchStats = useCallback(() => {
    setFetchingStats(true);
    medplum
      .get(medplum.fhirUrl('Agent', id, '$stats'), { cache: 'reload' })
      .then((result: Parameters) => {
        const valueString = result.parameter?.find((p) => p.name === 'stats')?.valueString;
        if (valueString) {
          try {
            setStats(JSON.parse(valueString) as AgentStats);
          } catch (err) {
            showError(normalizeErrorString(err));
          }
        }
      })
      .catch((err) => showError(normalizeErrorString(err)))
      .finally(() => setFetchingStats(false));
  }, [medplum, id]);

  function showSuccess(message: string): void {
    showNotification({
      color: 'green',
      title: 'Success',
      icon: <IconCheck size="1rem" />,
      message,
    });
  }

  function showError(message: string): void {
    showNotification({
      color: 'red',
      title: 'Error',
      message,
      autoClose: false,
    });
  }

  return (
    <Document>
      <Modal opened={modalOpened} onClose={closeModal} title="Upgrade Agent" centered>
        <UpgradeConfirmContent
          opened={modalOpened}
          close={closeModal}
          version={version}
          loadingStatus={loadingStatus}
          handleStatus={handleStatus}
          handleUpgrade={handleUpgrade}
        />
      </Modal>
      <Title order={1}>Agent Tools</Title>
      <div style={{ marginBottom: 10 }}>
        Agent: <ResourceName value={reference} link />
      </div>
      <Divider my="lg" />
      <Title order={2}>Agent Status</Title>
      <p>
        Retrieve the status of the agent. This tests whether the agent is connected to the Medplum server, and the last
        time it was able to communicate.
      </p>
      <Button onClick={handleStatus} loading={loadingStatus} disabled={working && !loadingStatus}>
        Get Status
      </Button>
      {!loadingStatus && status && (
        <Table>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>Status</Table.Td>
              <Table.Td>
                <StatusBadge status={status} />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Version</Table.Td>
              <Table.Td>{version}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Last Updated</Table.Td>
              <Table.Td>{formatDateTime(lastUpdated, undefined, { timeZoneName: 'longOffset' })}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      )}
      <Divider my="lg" />
      <Title order={2}>Reload Config</Title>
      <p>
        Reload the configuration of this agent, syncing it with the current version of the Agent resource on the Medplum
        server.
      </p>
      <Button
        onClick={handleReloadConfig}
        loading={reloadingConfig}
        disabled={working && !reloadingConfig}
        aria-label="Reload config"
      >
        Reload Config
      </Button>
      <Divider my="lg" />
      <Title order={2}>Upgrade Agent</Title>
      <p>Upgrade the version of this agent, to either the latest (default) or a specified version.</p>
      <Button onClick={openModal} loading={upgrading} disabled={working && !upgrading} aria-label="Upgrade agent">
        Upgrade
      </Button>
      <Divider my="lg" />
      <Form onSubmit={handleFetchLogs}>
        <Title order={2}>Fetch Logs</Title>
        <p>Fetch logs from the agent.</p>
        {logs?.length ? (
          <Code block mb={15}>
            {logs}
          </Code>
        ) : null}
        <Group>
          <NumberInput w={100} id="logLimit" name="logLimit" placeholder="20" label="Log Limit" />
          <Button
            mt={22}
            loading={fetchingLogs}
            disabled={working && !fetchingLogs}
            aria-label="Fetch logs"
            type="submit"
          >
            Fetch Logs
          </Button>
        </Group>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Agent Stats</Title>
      <p>
        Fetch runtime statistics from the agent, including connection counts, queue depths, RTT metrics, and overall
        agent health.
      </p>
      <Button
        onClick={handleFetchStats}
        loading={fetchingStats}
        disabled={working && !fetchingStats}
        aria-label="Get stats"
      >
        Get Stats
      </Button>
      {!fetchingStats && stats && <AgentStatsTables stats={stats} />}
      <Divider my="lg" />
      <Title order={2}>Ping from Agent</Title>
      <p>
        Send a ping command from the agent to a valid IP address or hostname. Use this tool to troubleshoot local
        network connectivity.
      </p>
      <Form onSubmit={handlePing}>
        <Group>
          <TextInput
            id="host"
            name="host"
            placeholder="ex. 127.0.0.1"
            label="IP Address / Hostname"
            rightSection={
              <ActionIcon
                size={24}
                radius="xl"
                variant="filled"
                type="submit"
                aria-label="Ping"
                loading={pinging}
                disabled={working && !pinging}
              >
                <IconRouter style={{ width: '1rem', height: '1rem' }} stroke={1.5} />
              </ActionIcon>
            }
          />
          <NumberInput id="pingCount" name="pingCount" placeholder="1" label="Ping Count" />
        </Group>
      </Form>
      {!pinging && lastPing && (
        <>
          <Title order={5} mt="sm" mb={0}>
            Last Ping
          </Title>
          <pre>{lastPing}</pre>
        </>
      )}
    </Document>
  );
}
