// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Anchor, Badge, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, getDisplayString, normalizeErrorString } from '@medplum/core';
import type { Communication, Resource } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconDownload } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';

export function SentFaxesPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [faxes, setFaxes] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(false);

  // Load sent faxes where current user is the sender
  const loadFaxes = useCallback(async () => {
    if (!profile?.id || profile.resourceType !== 'Practitioner') {
      return;
    }

    setLoading(true);
    try {
      const results = await medplum.searchResources('Communication', {
        medium: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode|FAXWRIT',
        _sort: '-sent',
        _count: '50',
        category: 'http://medplum.com/fhir/CodeSystem/fax-direction|outbound',
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
  }, [medplum, profile]);

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
          <Text c="dimmed">Loading sent faxes...</Text>
        </Stack>
      );
    }

    if (faxes.length === 0) {
      return (
        <Stack align="center" mt="xl">
          <Text c="dimmed">No sent faxes found.</Text>
        </Stack>
      );
    }

    return (
      <Stack gap="md">
        {faxes.map((fax) => (
          <SentFaxCard key={fax.id} fax={fax} />
        ))}
      </Stack>
    );
  };

  return (
    <Document>
      <Group justify="space-between" mb="lg">
        <Title order={1}>Sent Faxes</Title>
      </Group>
      {renderContent()}
    </Document>
  );
}

interface SentFaxCardProps {
  fax: Communication;
}

function SentFaxCard({ fax }: SentFaxCardProps): JSX.Element {
  const medplum = useMedplum();
  const efaxId = fax.identifier?.find((id) => id.system === 'https://efax.com')?.value;
  const attachment = fax.payload?.find((p) => p.contentAttachment)?.contentAttachment;

  const [recipient, setRecipient] = useState<Resource | undefined>();

  // Load the recipient resource to get name and fax number
  useEffect(() => {
    const recipientRef = fax.recipient?.[0];
    if (!recipientRef?.reference) {
      return;
    }

    medplum
      .readReference(recipientRef)
      .then(setRecipient)
      .catch((err) => {
        console.error('Failed to load recipient:', err);
        // Set undefined to use fallback display text
        setRecipient(undefined);
      });
  }, [medplum, fax.recipient]);

  // Extract name and fax number from recipient
  const getRecipientInfo = (): { name: string; faxNumber: string | undefined } => {
    if (!recipient) {
      return { name: fax.recipient?.[0]?.display || 'Unknown recipient', faxNumber: undefined };
    }

    if (recipient.resourceType === 'Organization') {
      const org = recipient;
      const faxNumber = org.contact?.[0]?.telecom?.find((t) => t.system === 'fax')?.value;
      return { name: org.name || 'Unknown organization', faxNumber };
    }

    if (recipient.resourceType === 'Practitioner') {
      const prac = recipient;
      const faxNumber = prac.telecom?.find((t) => t.system === 'fax')?.value;
      return { name: getDisplayString(prac), faxNumber };
    }

    return { name: getDisplayString(recipient), faxNumber: undefined };
  };

  const { name: recipientName, faxNumber: recipientFaxNumber } = getRecipientInfo();

  const getStatusColor = (status: string | undefined): string => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'in-progress':
        return 'blue';
      case 'preparation':
        return 'yellow';
      case 'stopped':
      case 'entered-in-error':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="xs">
        <Group>
          <Text fw={500}>Fax #{efaxId || 'Pending'}</Text>
          <Badge color={getStatusColor(fax.status)}>{fax.status}</Badge>
        </Group>
        {attachment?.url && (
          <ActionIcon variant="light" color="blue" component="a" href={attachment.url} target="_blank">
            <IconDownload size={18} />
          </ActionIcon>
        )}
      </Group>

      <Stack gap="xs">
        <Text size="sm" c="dimmed">
          To: {recipientName}
        </Text>
        {recipientFaxNumber && (
          <Text size="sm" c="dimmed">
            Fax: {recipientFaxNumber}
          </Text>
        )}
        {fax.sent && (
          <Text size="sm" c="dimmed">
            Sent: {formatDateTime(fax.sent)}
          </Text>
        )}
        {attachment?.url && (
          <Anchor href={attachment.url} target="_blank" size="sm">
            {attachment.title || 'View Document'}
          </Anchor>
        )}
      </Stack>
    </Card>
  );
}
