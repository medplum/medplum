import { ActionIcon, Button, Divider, Table, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ContentType, formatDateTime, normalizeErrorString } from '@medplum/core';
import { Agent, Parameters, Reference } from '@medplum/fhirtypes';
import { Document, Form, ResourceName, StatusBadge, useMedplum } from '@medplum/react';
import { IconRouter } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

export function ToolsPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const reference = useMemo(() => ({ reference: 'Agent/' + id }) as Reference<Agent>, [id]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [status, setStatus] = useState<string>();
  const [lastUpdated, setLastUpdated] = useState<string>();
  const [lastPing, setLastPing] = useState<string | undefined>();
  const [pinging, setPinging] = useState(false);

  const handleStatus = useCallback(() => {
    setLoadingStatus(true);
    medplum
      .get(medplum.fhirUrl('Agent', id, '$status'), { cache: 'reload' })
      .then((result: Parameters) => {
        setStatus(result.parameter?.find((p) => p.name === 'status')?.valueCode);
        setLastUpdated(result.parameter?.find((p) => p.name === 'lastUpdated')?.valueInstant);
      })
      .catch((err) => showError(normalizeErrorString(err)))
      .finally(() => setLoadingStatus(false));
  }, [medplum, id]);

  const handlePing = useCallback(
    (formData: Record<string, string>) => {
      const ip = formData.ip;
      if (!ip) {
        return;
      }
      setPinging(true);
      medplum
        .pushToAgent(reference, ip, 'PING', ContentType.PING, true)
        .then((pingResult: string) => setLastPing(pingResult))
        .catch((err: unknown) => showError(normalizeErrorString(err)))
        .finally(() => setPinging(false));
    },
    [medplum, reference]
  );

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
      <Button onClick={handleStatus} loading={loadingStatus}>
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
              <Table.Td>Last Updated</Table.Td>
              <Table.Td>{formatDateTime(lastUpdated)}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      )}
      <Divider my="lg" />
      <Title order={2}>Ping from Agent</Title>
      <p>
        Send a ping command from the agent to an IP address. Use this tool to troubleshoot local network connectivity.
      </p>
      <Form onSubmit={handlePing}>
        <TextInput
          id="ip"
          name="ip"
          placeholder="IP Address"
          rightSection={
            <ActionIcon size={24} radius="xl" variant="filled" type="submit" aria-label="Ping" loading={pinging}>
              <IconRouter style={{ width: '1rem', height: '1rem' }} stroke={1.5} />
            </ActionIcon>
          }
        />
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
