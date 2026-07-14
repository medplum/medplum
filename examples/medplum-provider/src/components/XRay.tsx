// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Modal, ScrollArea, Table, Text, Title } from '@mantine/core';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import type { MedplumClientEventMap } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

/**
 * A single HTTP round trip observed via the client's `requestStarted`/`requestFinished` events.
 * Starts as pending and is updated in place once the matching `requestFinished` event arrives.
 */
interface XRayRequest {
  requestId: number;
  method: string;
  url: string;
  body?: string;
  startTime: number;
  finished: boolean;
  durationMs?: number;
  status?: number;
  error?: Error;
}

export function XRay(): JSX.Element | null {
  const medplum = useMedplum();
  const [requests, setRequests] = useState<XRayRequest[]>([]);
  const [opened, handlers] = useDisclosure(false);

  useHotkeys([['mod+b', handlers.toggle]]);

  useEffect(() => {
    const requestStartedListener = (event: MedplumClientEventMap['requestStarted']): void => {
      setRequests((prev) => [...prev, { ...event.payload, finished: false }]);
    };
    const requestFinishedListener = (event: MedplumClientEventMap['requestFinished']): void => {
      setRequests((prev) =>
        prev.map((request) =>
          request.requestId === event.payload.requestId ? { ...request, ...event.payload, finished: true } : request
        )
      );
    };
    medplum.addEventListener('requestStarted', requestStartedListener);
    medplum.addEventListener('requestFinished', requestFinishedListener);

    return () => {
      medplum.removeEventListener('requestStarted', requestStartedListener);
      medplum.removeEventListener('requestFinished', requestFinishedListener);
    };
  }, [medplum]);

  return (
    <Modal opened={opened} onClose={handlers.close} title={<Title order={3}>FHIR X-Ray</Title>} size="xl">
      {requests.length === 0 ? (
        <Text c="dimmed">No requests yet.</Text>
      ) : (
        <ScrollArea.Autosize mah="70vh">
          <Table layout="fixed" verticalSpacing="xs" horizontalSpacing="sm" stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={80}>Method</Table.Th>
                <Table.Th w={90}>Status</Table.Th>
                <Table.Th>URL</Table.Th>
                <Table.Th w={90} ta="right">
                  Duration
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {requests
                .slice()
                .reverse()
                .map((request) => (
                  <RequestRow key={request.requestId} request={request} />
                ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      )}
    </Modal>
  );
}

function RequestRow({ request }: { request: XRayRequest }): JSX.Element {
  return (
    <Table.Tr>
      <Table.Td>
        <Badge variant="light">{request.method}</Badge>
      </Table.Td>
      <Table.Td>
        <StatusBadge request={request} />
      </Table.Td>
      <Table.Td>
        <Text ff="monospace" size="sm" truncate title={request.url}>
          {request.url}
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text c="dimmed" size="xs">
          {request.finished ? `${Math.round(request.durationMs ?? 0)} ms` : '—'}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

function StatusBadge({ request }: { request: XRayRequest }): JSX.Element {
  if (!request.finished) {
    return (
      <Badge color="blue" variant="light">
        pending
      </Badge>
    );
  }
  if (request.error || (request.status !== undefined && request.status >= 400)) {
    return (
      <Badge color="red" variant="light">
        {request.status ?? 'error'}
      </Badge>
    );
  }
  return (
    <Badge color="green" variant="light">
      {request.status ?? 'ok'}
    </Badge>
  );
}
