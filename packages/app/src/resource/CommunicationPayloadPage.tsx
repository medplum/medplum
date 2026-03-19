// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Stack, Textarea } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { EMPTY, normalizeErrorString } from '@medplum/core';
import type { Communication, CommunicationPayload, ResourceType } from '@medplum/fhirtypes';
import { Document, useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { cleanResource } from './utils';

export function CommunicationPayloadPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const communication = useResource<Communication>({ reference: resourceType + '/' + id });
  const [payload, setPayload] = useState<CommunicationPayload[]>([]);

  useEffect(() => {
    if (communication) {
      setPayload((communication.payload ?? EMPTY).filter((item) => 'contentString' in item));
    }
  }, [communication]);

  const handleChange = useCallback((index: number, value: string): void => {
    setPayload((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], contentString: value };
      return updated;
    });
  }, []);

  const handleAdd = useCallback((): void => {
    setPayload((prev) => [...prev, { contentString: '' }]);
  }, []);

  const handleSave = useCallback((): void => {
    if (!communication) {
      return;
    }
    medplum
      .updateResource(cleanResource({ ...communication, payload }))
      .then(() => showNotification({ color: 'green', message: 'Saved' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [medplum, communication, payload]);

  if (!communication) {
    return null;
  }

  return (
    <Document>
      <Stack>
        {payload.map((item, index) => (
          <Textarea
            key={index}
            autosize
            minRows={3}
            maxRows={20}
            value={item.contentString ?? ''}
            onChange={(e) => handleChange(index, e.currentTarget.value)}
            placeholder="Enter content..."
          />
        ))}
        <Group justify="flex-end">
          <Button variant="outline" onClick={handleAdd}>Add payload</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Document>
  );
}
