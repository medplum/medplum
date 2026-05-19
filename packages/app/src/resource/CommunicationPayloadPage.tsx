// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { EMPTY, normalizeErrorString } from '@medplum/core';
import type { Communication, CommunicationPayload, ResourceType } from '@medplum/fhirtypes';
import { Document, useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { cleanResource } from './utils';

type KeyedPayload = { key: number; item: CommunicationPayload };

export function CommunicationPayloadPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const communication = useResource<Communication>({ reference: resourceType + '/' + id });
  const keyCounter = useRef(0);
  const [payload, setPayload] = useState<KeyedPayload[]>([]);

  useEffect(() => {
    if (communication) {
      setPayload((communication.payload ?? EMPTY).map((item) => ({ key: keyCounter.current++, item })));
    }
  }, [communication]);

  const handleChange = useCallback((key: number, value: string): void => {
    setPayload((prev) => prev.map((p) => (p.key === key ? { ...p, item: { ...p.item, contentString: value } } : p)));
  }, []);

  const handleAdd = useCallback((): void => {
    setPayload((prev) => [...prev, { key: keyCounter.current++, item: { contentString: '' } }]);
  }, []);

  const handleSave = useCallback((): void => {
    if (!communication) {
      return;
    }
    medplum
      .updateResource(cleanResource({ ...communication, payload: payload.map((p) => p.item) }))
      .then(() => showNotification({ color: 'green', message: 'Saved' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [medplum, communication, payload]);

  if (!communication) {
    return null;
  }

  return (
    <Document>
      <Stack>
        {payload
          .filter(({ item }) => 'contentString' in item)
          .map(({ key, item }) => (
            <Textarea
              key={key}
              autosize
              minRows={3}
              maxRows={20}
              value={item.contentString ?? ''}
              onChange={(e) => handleChange(key, e.currentTarget.value)}
              placeholder="Enter content..."
            />
          ))}
        <Group justify="flex-end">
          <Button variant="outline" onClick={handleAdd}>
            Add payload
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
        <Text size="xs" c="dimmed">
          This tab manages string payloads only. Attachments and References can be managed in the Edit tab.
        </Text>
      </Stack>
    </Document>
  );
}
