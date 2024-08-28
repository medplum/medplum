import { ActionIcon, Button, Divider, Group, NumberInput, Table, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ContentType, formatDateTime, normalizeErrorString } from '@medplum/core';
import { Agent, Bundle, Parameters, Reference } from '@medplum/fhirtypes';
import { Document, Form, ResourceName, StatusBadge, useMedplum } from '@medplum/react';
import { IconCheck, IconRouter } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

export function ToolsPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const reference = useMemo<Reference<Agent>>(() => ({ reference: 'Agent/' + id }), [id]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [reloadingConfig, setReloadingConfig] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [status, setStatus] = useState<string>();
  const [version, setVersion] = useState<string>();
  const [lastUpdated, setLastUpdated] = useState<string>();
  const [lastPing, setLastPing] = useState<string | undefined>();
  const [pinging, setPinging] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (loadingStatus || reloadingConfig || upgrading || pinging) {
      setWorking(true);
      return;
    }
    setWorking(false);
  }, [loadingStatus, reloadingConfig, upgrading, pinging]);

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

  const handleUpgrade = useCallback(() => {
    setUpgrading(true);
    medplum
      .get(medplum.fhirUrl('Agent', id, '$upgrade'), { cache: 'reload' })
      .then((_result: Bundle<Parameters>) => {
        showSuccess('Agent upgraded successfully.');
      })
      .catch((err) => showError(normalizeErrorString(err)))
      .finally(() => setUpgrading(false));
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
      <Button onClick={handleUpgrade} loading={upgrading} disabled={working && !upgrading} aria-label="Upgrade agent">
        Upgrade
      </Button>
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
