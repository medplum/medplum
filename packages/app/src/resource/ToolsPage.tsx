import {
  ActionIcon,
  Button,
  Checkbox,
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
import { ContentType, fetchLatestVersionString, formatDateTime, normalizeErrorString } from '@medplum/core';
import { Agent, Bundle, Parameters, Reference } from '@medplum/fhirtypes';
import { Document, Form, Loading, ResourceName, StatusBadge, useMedplum } from '@medplum/react';
import { IconCheck, IconRouter } from '@tabler/icons-react';
import { JSX, useCallback, useEffect, useMemo, useState } from 'react';
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
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

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

  const handleUpgrade = useCallback(
    (force: boolean) => {
      setUpgrading(true);
      medplum
        .get(medplum.fhirUrl('Agent', id, '$upgrade', `?force=${force}`), { cache: 'reload' })
        .then((_result: Bundle<Parameters>) => {
          showSuccess('Agent upgraded successfully.');
        })
        .catch((err) => showError(normalizeErrorString(err)))
        .finally(() => setUpgrading(false));
    },
    [medplum, id]
  );

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
