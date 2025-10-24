// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Card, Stack, Text, Group, Textarea, Button, Divider } from '@mantine/core';
import { IconLock, IconPencil, IconSignature } from '@tabler/icons-react';
import type { Provenance, Encounter } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { ChartNoteStatus } from '../../types/encounter';
import { createReference, formatDate } from '@medplum/core';
import { showErrorNotification } from '../../utils/notifications';

interface SignAddendumCardProps {
  provenances: Provenance[];
  chartNoteStatus: ChartNoteStatus;
  encounter: Encounter;
}

interface ProvenanceDisplay {
  practitionerName: string;
  timestamp: string;
}

interface AddendumDisplay {
  authorName: string;
  timestamp: string;
  text: string;
}

export const SignAddendumCard = ({
  provenances,
  chartNoteStatus,
  encounter,
}: SignAddendumCardProps): JSX.Element | null => {
  const medplum = useMedplum();
  const author = useMedplumProfile();
  const authorReference = author ? createReference(author) : undefined;
  const [provenanceDisplays, setProvenanceDisplays] = useState<ProvenanceDisplay[]>([]);
  const [addendumDisplays, setAddendumDisplays] = useState<AddendumDisplay[]>([]);
  const [addendumText, setAddendumText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadProvenanceData = async (): Promise<void> => {
      const displays: ProvenanceDisplay[] = provenances.map((prov) => ({
        practitionerName: prov.agent?.[0]?.who?.display || 'Unknown Practitioner',
        timestamp: formatDate(prov.recorded),
      }));
      setProvenanceDisplays(displays);
    };
    loadProvenanceData().catch(showErrorNotification);
  }, [provenances, medplum]);

  useEffect(() => {
    const loadAddendums = async (): Promise<void> => {
      try {
        const bundle = await medplum.searchResources('DocumentReference', {
          encounter: `Encounter/${encounter.id}`,
          type: '55107-7', // LOINC code for Addendum Document
          _sort: '-date',
        });

        const displays: AddendumDisplay[] = bundle.map((doc) => {
          const authorName = doc.author?.[0]?.display || 'Unknown Author';
          const timestamp = doc.date ? formatDate(doc.date) : 'Unknown Date';
          const encodedText = doc.content?.[0]?.attachment?.data;
          const text = encodedText ? atob(encodedText) : '';

          return {
            authorName,
            timestamp,
            text,
          };
        });
        setAddendumDisplays(displays);
      } catch (error) {
        showErrorNotification(error);
      }
    };

    if (encounter.id) {
      loadAddendums().catch(console.error);
    }
  }, [encounter.id, medplum]);

  const handleAddAddendum = async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      const documentReference = await medplum.createResource({
        resourceType: 'DocumentReference',
        status: 'current',
        type: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '55107-7',
              display: 'Addendum Document',
            },
          ],
        },
        subject: encounter.subject,
        author: [
          {
            reference: authorReference?.reference,
            display: authorReference?.display,
          },
        ],
        context: {
          encounter: [
            {
              reference: `Encounter/${encounter.id}`,
            },
          ],
        },
        date: new Date().toISOString(),
        content: [
          {
            attachment: {
              contentType: 'text/plain',
              data: btoa(addendumText),
              title: 'Addendum',
            },
          },
        ],
      });

      setAddendumDisplays([
        ...addendumDisplays,
        {
          authorName: authorReference?.display || 'Unknown Author',
          timestamp: formatDate(documentReference.date),
          text: addendumText,
        },
      ]);
      setAddendumText('');
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (provenanceDisplays.length === 0) {
    return null;
  }

  return (
    <Card withBorder shadow="sm">
      <Stack gap="md">
        {provenanceDisplays.map((display, index) => (
          <Stack key={`prov-${index}`}>
            <Group gap="sm">
              {provenanceDisplays.length - 1 === index && chartNoteStatus === ChartNoteStatus.SignedAndLocked ? (
                <IconLock size={20} />
              ) : (
                <IconSignature size={20} />
              )}
              <Text fw={500}>
                {provenanceDisplays.length - 1 === index && chartNoteStatus === ChartNoteStatus.SignedAndLocked
                  ? 'Signed and Locked by '
                  : 'Signed by '}
                {display.practitionerName}
              </Text>
              <Text c="dimmed" size="sm">
                {display.timestamp}
              </Text>
            </Group>
            <Divider />
          </Stack>
        ))}

        {addendumDisplays.map((addendum, index) => (
          <Stack key={`addendum-${index}`}>
            <Group gap="sm" align="flex-start">
              <IconPencil size={20} />
              <Stack gap="xs" style={{ flex: 1 }}>
                <Group gap="sm">
                  <Text fw={500}>Addendum by {addendum.authorName}</Text>
                  <Text c="dimmed" size="sm">
                    {addendum.timestamp}
                  </Text>
                </Group>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {addendum.text}
                </Text>
              </Stack>
            </Group>
            <Divider />
          </Stack>
        ))}

        <Text fw={600} mt="sm">
          Add Addendum
        </Text>
        <Textarea
          placeholder="Add an addendum to this Visit..."
          value={addendumText}
          onChange={(e) => setAddendumText(e.target.value)}
          autosize
          minRows={3}
          maxRows={6}
        />
        <Group justify="flex-end">
          <Button
            leftSection={<IconPencil size={16} />}
            onClick={handleAddAddendum}
            disabled={!addendumText.trim() || isSubmitting}
            loading={isSubmitting}
          >
            Add Addendum
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
