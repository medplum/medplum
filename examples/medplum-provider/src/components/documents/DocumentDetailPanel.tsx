import { ActionIcon, Badge, Box, Divider, Flex, Group, Paper, ScrollArea, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { formatDate, normalizeErrorString } from '@medplum/core';
import type { Attachment, Communication, DocumentReference, Reference, Patient } from '@medplum/fhirtypes';
import { AttachmentDisplay, useMedplum } from '@medplum/react';
import {
  IconCircleCheck,
  IconCircleOff,
  IconDeviceFloppy,
  IconDownload,
  IconExternalLink,
  IconPrinter,
} from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import type { PatientDocument } from './DocumentListItem';
import { SendFaxModal } from '../fax/SendFaxModal';

interface DocumentDetailPanelProps {
  item: PatientDocument;
  patientRef?: Reference<Patient>;
  onDocumentChange: () => void;
}

export function DocumentDetailPanel({ item, patientRef, onDocumentChange }: DocumentDetailPanelProps): JSX.Element {
  const medplum = useMedplum();
  const [faxModalOpened, setFaxModalOpened] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(item.name);

  const attachment = getAttachment(item);

  const handleSaveName = async (): Promise<void> => {
    if (item.resourceType === 'DocumentReference') {
      try {
        const doc = item.resource as DocumentReference;
        await medplum.updateResource({ ...doc, description: nameValue });
        notifications.show({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Document name updated',
        });
        setEditingName(false);
        onDocumentChange();
      } catch (error) {
        notifications.show({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(error),
        });
      }
    }
  };

  const handleDownload = (): void => {
    if (attachment?.url) {
      const link = document.createElement('a');
      link.href = attachment.url;
      link.download = attachment.title || item.name;
      link.target = '_blank';
      link.click();
    }
  };

  const handleOpenInBrowser = (): void => {
    if (attachment?.url) {
      window.open(attachment.url, '_blank');
    }
  };

  return (
    <>
      <Box h="100%" style={{ flex: 1 }}>
        <Paper h="100%">
          <Flex direction="column" h="100%">
            <Box px="md" py="sm">
              <Group justify="space-between" align="flex-start">
                <Stack gap={4} style={{ flex: 1 }}>
                  {editingName && item.resourceType === 'DocumentReference' ? (
                    <Group gap="xs">
                      <TextInput
                        value={nameValue}
                        onChange={(e) => setNameValue(e.currentTarget.value)}
                        size="sm"
                        style={{ flex: 1 }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveName().catch(console.error);
                          }
                          if (e.key === 'Escape') {
                            setEditingName(false);
                            setNameValue(item.name);
                          }
                        }}
                        autoFocus
                      />
                      <ActionIcon variant="transparent" radius="xl" size={32} className="outline-icon-button" onClick={() => handleSaveName().catch(console.error)}>
                        <IconDeviceFloppy size={16} />
                      </ActionIcon>
                    </Group>
                  ) : (
                    <Text
                      fw={700}
                      size="lg"
                      onClick={() => {
                        if (item.resourceType === 'DocumentReference') {
                          setEditingName(true);
                        }
                      }}
                      style={item.resourceType === 'DocumentReference' ? { cursor: 'pointer' } : undefined}
                      title={item.resourceType === 'DocumentReference' ? 'Click to edit name' : undefined}
                    >
                      {item.name}
                    </Text>
                  )}

                  <Group gap="xs">
                    <Badge size="sm" color={item.tagColor} variant="light">
                      {item.tag}
                    </Badge>
                    {attachment?.contentType && (
                      <Text size="xs" c="dimmed">
                        {attachment.contentType}
                      </Text>
                    )}
                  </Group>

                  {item.date && (
                    <Text size="sm" c="dimmed">
                      Added: {formatDate(item.date)}
                    </Text>
                  )}

                  <Text size="sm" c="dimmed">
                    Source: {item.resourceType === 'Communication' ? 'Fax' : 'Upload'}
                  </Text>
                </Stack>

                <Group gap="xs">
                  {attachment?.url && (
                    <>
                      <Tooltip label="Open in Browser" position="bottom" openDelay={500}>
                        <ActionIcon variant="transparent" radius="xl" size={32} className="outline-icon-button" onClick={handleOpenInBrowser}>
                          <IconExternalLink size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Download" position="bottom" openDelay={500}>
                        <ActionIcon variant="transparent" radius="xl" size={32} className="outline-icon-button" onClick={handleDownload}>
                          <IconDownload size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </>
                  )}
                  <Tooltip label="Fax Document" position="bottom" openDelay={500}>
                    <ActionIcon variant="transparent" radius="xl" size={32} className="outline-icon-button" onClick={() => setFaxModalOpened(true)}>
                      <IconPrinter size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Box>

            <Divider />

            <ScrollArea style={{ flex: 1 }}>
              <Box p="md">
                {attachment ? (
                  <AttachmentDisplay value={attachment} maxWidth={900} />
                ) : (
                  <Flex justify="center" align="center" h={300}>
                    <Text c="dimmed">No preview available for this document</Text>
                  </Flex>
                )}
              </Box>
            </ScrollArea>
          </Flex>
        </Paper>
      </Box>

      <SendFaxModal
        opened={faxModalOpened}
        onClose={() => setFaxModalOpened(false)}
        defaultAttachment={attachment}
        defaultPatient={patientRef}
      />
    </>
  );
}

function getAttachment(item: PatientDocument): Attachment | undefined {
  if (item.resourceType === 'DocumentReference') {
    const doc = item.resource as DocumentReference;
    return doc.content?.[0]?.attachment;
  }
  const comm = item.resource as Communication;
  return comm.payload?.find((p) => p.contentAttachment)?.contentAttachment;
}
