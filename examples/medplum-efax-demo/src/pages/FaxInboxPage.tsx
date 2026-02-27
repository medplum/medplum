// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Anchor, Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, isNotFound, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconDownload, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';

export function FaxInboxPage(): JSX.Element {
  const medplum = useMedplum();
  const [faxes, setFaxes] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load existing faxes from the server
  const loadFaxes = useCallback(async () => {
    setLoading(true);
    try {
      const results = await medplum.searchResources('Communication', {
        medium: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode|FAXWRIT',
        _sort: '-sent',
        _count: '50',
        category: 'http://medplum.com/fhir/CodeSystem/fax-direction|inbound',
      });
      setFaxes(results);
    } catch (err) {
      showNotification({
        color: 'red',
        title: 'Error',
        message: normalizeErrorString(err),
      });
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  // Refresh faxes by calling the $receive-efax operation
  const refreshFaxes = useCallback(async () => {
    setRefreshing(true);
    try {
      // Call the custom $receive-efax operation on Practitioner
      const receiveEfaxUrl = medplum.fhirUrl('Communication', '$receive-efax');
      try {
        await medplum.post(receiveEfaxUrl, {});
      } catch (efaxErr) {
        // Check if this is a 404 error for the efax operation
        if (efaxErr instanceof OperationOutcomeError && isNotFound(efaxErr.outcome)) {
          showNotification({
            color: 'red',
            title: 'Error',
            message: 'Efax integration not setup contact Medplum Support',
          });
          return;
        }
        // Re-throw if it's not a 404
        throw efaxErr;
      }
      showNotification({
        color: 'green',
        title: 'Success',
        message: 'Faxes refreshed from eFax',
      });
      // Reload the fax list
      await loadFaxes();
    } catch (err) {
      showNotification({
        color: 'red',
        title: 'Error',
        message: normalizeErrorString(err),
      });
    } finally {
      setRefreshing(false);
    }
  }, [medplum, loadFaxes]);

  useEffect(() => {
    loadFaxes().catch((err) => {
      showNotification({
        color: 'red',
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
  }, [loadFaxes]);

  const renderContent = (): JSX.Element => {
    if (loading) {
      return (
        <Stack align="center" mt="xl">
          <Loader />
          <Text c="dimmed">Loading faxes...</Text>
        </Stack>
      );
    }

    if (faxes.length === 0) {
      return (
        <Stack align="center" mt="xl">
          <Text c="dimmed">No faxes found. Click "Refresh from eFax" to check for new faxes.</Text>
        </Stack>
      );
    }

    return (
      <Stack gap="md">
        {faxes.map((fax) => (
          <FaxCard key={fax.id} fax={fax} />
        ))}
      </Stack>
    );
  };

  return (
    <Document>
      <Group justify="space-between" mb="lg">
        <Title order={1}>Fax Inbox</Title>
        <Button leftSection={<IconRefresh size={16} />} onClick={refreshFaxes} loading={refreshing}>
          Refresh from eFax
        </Button>
      </Group>
      {renderContent()}
    </Document>
  );
}

interface FaxCardProps {
  fax: Communication;
}

function FaxCard({ fax }: FaxCardProps): JSX.Element {
  const efaxId = fax.identifier?.find((id) => id.system === 'https://efax.com')?.value;
  const attachment = fax.payload?.find((p) => p.contentAttachment)?.contentAttachment;

  // Get the originating fax number from the extension
  const originatingFaxNumber = fax.extension?.find(
    (ext) => ext.url === 'https://efax.com/originating-fax-number'
  )?.valueString;

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="xs">
        <Group>
          <Text fw={500}>Fax #{efaxId || 'Unknown'}</Text>
          <Badge color={fax.status === 'completed' ? 'green' : 'blue'}>{fax.status}</Badge>
        </Group>
        {attachment?.url && (
          <ActionIcon variant="light" color="blue" component="a" href={attachment.url} target="_blank">
            <IconDownload size={18} />
          </ActionIcon>
        )}
      </Group>

      <Stack gap="xs">
        {originatingFaxNumber && (
          <Text size="sm" c="dimmed">
            From: {originatingFaxNumber}
          </Text>
        )}
        {fax.sent && (
          <Text size="sm" c="dimmed">
            Received: {formatDateTime(fax.sent)}
          </Text>
        )}
        {attachment?.url && (
          <Anchor href={attachment.url} target="_blank" size="sm">
            {attachment.title || 'Download Fax PDF'}
          </Anchor>
        )}
      </Stack>
    </Card>
  );
}
