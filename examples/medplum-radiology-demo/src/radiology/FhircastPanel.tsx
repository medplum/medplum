// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Group, Paper, TextInput } from '@mantine/core';
import type { FhircastConnection, FhircastEventName, FhircastMessagePayload } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { showErrorNotification } from '../utils/notifications';

// Heartbeats are deliberately absent: the hub sends them regardless of the subscription, and the
// client swallows them rather than dispatching a message, so naming one here only fails validation.
const RADIOLOGY_EVENTS: FhircastEventName[] = ['ImagingStudy-open', 'ImagingStudy-close', 'syncerror'];

type Status = 'disconnected' | 'connecting' | 'connected';

export interface FhircastPanelProps {
  readonly onMessage?: (message: FhircastMessagePayload) => void;
  /** Called with the topic once connected, and with `undefined` when the user disconnects. */
  readonly onConnectedTopicChange?: (topic: string | undefined) => void;
}

export function FhircastPanel({ onMessage, onConnectedTopicChange }: FhircastPanelProps): JSX.Element {
  const medplum = useMedplum();
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<Status>('disconnected');
  const connectionRef = useRef<FhircastConnection>(undefined);
  const onMessageRef = useRef(onMessage);
  const onConnectedTopicChangeRef = useRef(onConnectedTopicChange);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectedTopicChangeRef.current = onConnectedTopicChange;
  }, [onMessage, onConnectedTopicChange]);

  useEffect(() => {
    return () => connectionRef.current?.disconnect();
  }, []);

  const disconnect = (): void => {
    connectionRef.current?.disconnect();
    connectionRef.current = undefined;
    setStatus('disconnected');
    onConnectedTopicChangeRef.current?.(undefined);
  };

  const connect = (): void => {
    setStatus('connecting');
    medplum
      .fhircastSubscribe(topic.trim(), RADIOLOGY_EVENTS)
      .then((subRequest) => {
        const connection = medplum.fhircastConnect(subRequest);
        connection.addEventListener('connect', () => {
          setStatus('connected');
          onConnectedTopicChangeRef.current?.(subRequest.topic);
        });
        // The connection retries on its own, so a drop is a status to show rather than a teardown.
        connection.addEventListener('disconnect', () => setStatus('connecting'));
        connection.addEventListener('message', (event) => onMessageRef.current?.(event.payload));
        connectionRef.current = connection;
      })
      .catch((err) => {
        setStatus('disconnected');
        showErrorNotification(err);
      });
  };

  const isConnected = status !== 'disconnected';
  const badgeColor = { connected: 'green', connecting: 'yellow', disconnected: 'gray' }[status];

  return (
    <Paper withBorder p="xs">
      <Group gap="xs" wrap="nowrap">
        <TextInput
          size="xs"
          placeholder="FHIRcast topic"
          aria-label="FHIRcast topic"
          value={topic}
          disabled={isConnected}
          onChange={(e) => setTopic(e.currentTarget.value)}
        />
        <Button
          size="xs"
          variant="light"
          disabled={!isConnected && !topic.trim()}
          onClick={isConnected ? disconnect : connect}
        >
          {isConnected ? 'Disconnect' : 'Connect'}
        </Button>
        <Badge size="sm" color={badgeColor} variant="light">
          {status}
        </Badge>
      </Group>
    </Paper>
  );
}
