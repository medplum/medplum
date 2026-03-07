// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Divider, Flex, Group, Paper, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { formatDate, normalizeErrorString } from '@medplum/core';
import type { Attachment, Communication, DocumentReference, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCachedBinaryUrl } from '@medplum/react-hooks';
import { IconCheck, IconCircleCheck, IconCircleOff, IconExternalLink, IconPrinter } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { SendFaxModal } from '../fax/SendFaxModal';
import type { PatientDocument } from './DocumentListItem.utils';

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
  const attachmentUrl = useCachedBinaryUrl(attachment?.url);

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

  const handleOpenInBrowser = (): void => {
    if (attachment?.url) {
      window.open(attachment.url, '_blank');
    }
  };

  return (
    <>
      <Box h="100%" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <Paper h="100%">
          <Flex direction="column" h="100%">
            <Box p="md">
              <Group justify="space-between" align="center">
                <Stack gap={4} style={{ flex: 1 }}>
                  {editingName && item.resourceType === 'DocumentReference' ? (
                    <Group gap="xs" wrap="nowrap">
                      <TextInput
                        value={nameValue}
                        onChange={(e) => setNameValue(e.currentTarget.value)}
                        size="xs"
                        style={{ flex: 1, maxWidth: 400 }}
                        styles={{ input: { fontWeight: 700, fontSize: 'var(--mantine-font-size-lg)' } }}
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
                        onBlur={(e) => {
                          if (!e.relatedTarget?.closest('[data-save-name]')) {
                            setEditingName(false);
                            setNameValue(item.name);
                          }
                        }}
                      />
                      <ActionIcon
                        variant="filled"
                        color="blue"
                        radius="xl"
                        size={32}
                        data-save-name
                        onClick={() => handleSaveName().catch(console.error)}
                      >
                        <IconCheck size={16} />
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
                </Stack>

                <Group gap="xs">
                  {attachment?.url && (
                    <>
                      <Tooltip label="Open in Browser" position="bottom" openDelay={500}>
                        <ActionIcon
                          variant="transparent"
                          radius="xl"
                          size={32}
                          className="outline-icon-button"
                          onClick={handleOpenInBrowser}
                        >
                          <IconExternalLink size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </>
                  )}
                  <Tooltip label="Fax Document" position="bottom" openDelay={500}>
                    <ActionIcon
                      variant="transparent"
                      radius="xl"
                      size={32}
                      className="outline-icon-button"
                      onClick={() => setFaxModalOpened(true)}
                    >
                      <IconPrinter size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Box>

            <Divider />

            {isPdfLike(attachment) ? (
              <>
                <Box p="md" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  {attachmentUrl && (
                    <Box
                      style={{
                        flex: 1,
                        borderRadius: 4,
                        overflow: 'hidden',
                        border: `1px solid color-mix(in srgb, var(--mantine-color-gray-3) 50%, transparent)`,
                      }}
                    >
                      <iframe
                        title="Attachment"
                        width="100%"
                        height="100%"
                        src={attachmentUrl + '#navpanes=0'}
                        allowFullScreen={true}
                        style={{ display: 'block', border: 0 }}
                      />
                    </Box>
                  )}
                </Box>

                <Box px="md">
                  <Divider color="gray.1" />
                </Box>

                <Box p="md">
                  <DocumentMetadata item={item} contentType={attachment?.contentType} author={getAuthor(item)} />
                </Box>
              </>
            ) : (
              <Box style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                <Box p="md">
                  {attachment ? (
                    <AttachmentPreview attachment={attachment} url={attachmentUrl} />
                  ) : (
                    <Flex justify="center" align="center" h={300}>
                      <Text c="dimmed">No preview available for this document</Text>
                    </Flex>
                  )}
                </Box>

                <Box px="md">
                  <Divider color="gray.1" />
                </Box>

                <Box p="md">
                  <DocumentMetadata item={item} contentType={attachment?.contentType} author={getAuthor(item)} />
                </Box>
              </Box>
            )}
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

function isPdfLike(attachment: Attachment | undefined): boolean {
  const ct = attachment?.contentType;
  if (!ct) {
    return false;
  }
  return ct === 'application/pdf' || ct === 'application/json' || ct.startsWith('text/');
}

function getAuthor(item: PatientDocument): string | undefined {
  if (item.resourceType === 'DocumentReference') {
    const doc = item.resource as DocumentReference;
    const author = doc.meta?.author;
    return author?.display ?? author?.reference;
  }
  const comm = item.resource as Communication;
  const sender = comm.sender;
  return sender?.display ?? sender?.reference;
}

function DocumentMetadata({
  item,
  contentType,
  author,
}: {
  item: PatientDocument;
  contentType: string | undefined;
  author: string | undefined;
}): JSX.Element {
  return (
    <Stack gap="sm">
      <Group align="flex-start" gap="lg">
        <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
          Type
        </Text>
        <Text size="sm">{item.tag}</Text>
      </Group>
      {contentType && (
        <Group align="flex-start" gap="lg">
          <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
            Content type
          </Text>
          <Text size="sm">{contentType}</Text>
        </Group>
      )}
      {item.date && (
        <Group align="flex-start" gap="lg">
          <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
            Added
          </Text>
          <Text size="sm">{formatDate(item.date)}</Text>
        </Group>
      )}
      {author && (
        <Group align="flex-start" gap="lg">
          <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
            Author
          </Text>
          <Text size="sm">{author}</Text>
        </Group>
      )}
      <Group align="flex-start" gap="lg">
        <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
          Source
        </Text>
        <Text size="sm">{item.resourceType === 'Communication' ? 'Fax' : 'Upload'}</Text>
      </Group>
    </Stack>
  );
}

interface AttachmentPreviewProps {
  attachment: Attachment;
  url: string | undefined;
}

function AttachmentPreview({ attachment, url }: AttachmentPreviewProps): JSX.Element {
  const contentType = attachment.contentType;
  const previewBorder = '1px solid color-mix(in srgb, var(--mantine-color-gray-3) 50%, transparent)';

  if (!url || !contentType) {
    return (
      <Flex justify="center" align="center" h={300}>
        <Text c="dimmed">No preview available for this document</Text>
      </Flex>
    );
  }

  if (contentType.startsWith('image/')) {
    return (
      <Box
        style={{ display: 'block', maxWidth: 'fit-content', position: 'relative', borderRadius: 4, overflow: 'hidden' }}
      >
        <img
          src={url}
          alt={attachment.title ?? 'Attachment'}
          style={{ width: 'auto', maxWidth: '100%', height: 'auto', display: 'block' }}
        />
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            border: previewBorder,
            borderRadius: 4,
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }}
        />
      </Box>
    );
  }

  if (contentType.startsWith('video/')) {
    return (
      <Box style={{ width: '100%', maxWidth: '100%', position: 'relative', borderRadius: 4, overflow: 'hidden' }}>
        <video style={{ width: '100%', maxWidth: '100%', height: 'auto', display: 'block' }} controls={true}>
          <source type={contentType} src={url} />
        </video>
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            border: previewBorder,
            borderRadius: 4,
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }}
        />
      </Box>
    );
  }

  return (
    <Flex justify="center" align="center" h={300}>
      <Text c="dimmed">No preview available for this file type</Text>
    </Flex>
  );
}
