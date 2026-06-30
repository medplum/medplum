// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Divider, Flex, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatDate, getDisplayString, getReferenceString } from '@medplum/core';
import type { Attachment, DocumentReference, Patient, Reference } from '@medplum/fhirtypes';
import { useCachedBinaryUrl } from '@medplum/react-hooks';
import { IconBrowserShare, IconEditCircle, IconPrinter } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { SendFaxModal } from '../../components/fax/SendFaxModal';
import { getDocumentTypeDisplay } from './DocumentReference.utils';
import { EditDocumentDetailsModal } from './EditDocumentDetailsModal';

// Subtle 1px frame drawn around attachment previews (PDF iframe, images, video). Theme-aware so the
// frame stays subtle in both schemes: gray-3 in light, dark-4 in dark (matching the dividers).
const PREVIEW_BORDER =
  '1px solid color-mix(in srgb, light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4)) 50%, transparent)';

interface DocumentDetailPanelProps {
  item: WithId<DocumentReference>;
  patientRef?: Reference<Patient>;
  onDocumentChange: () => void;
  onDocumentDeleted: () => void;
}

export function DocumentDetailPanel({
  item,
  patientRef,
  onDocumentChange,
  onDocumentDeleted,
}: DocumentDetailPanelProps): JSX.Element {
  const [faxModalOpened, setFaxModalOpened] = useState(false);
  const [editModalOpened, setEditModalOpened] = useState(false);

  const attachment = getAttachment(item);
  const attachmentUrl = useCachedBinaryUrl(attachment?.url);
  const name = getDisplayString(item);
  const referenceString = getReferenceString(item);

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
                  <Text fw={700} size="lg">
                    {name === referenceString ? 'Untitled Document' : name}
                  </Text>
                </Stack>

                <Group gap="xs">
                  <Tooltip label="Edit Document Details" position="bottom" openDelay={500}>
                    <ActionIcon
                      variant="transparent"
                      radius="xl"
                      size={32}
                      className="outline-icon-button"
                      onClick={() => setEditModalOpened(true)}
                    >
                      <IconEditCircle size={16} />
                    </ActionIcon>
                  </Tooltip>
                  {attachment?.url && (
                    <Tooltip label="Open in Browser" position="bottom" openDelay={500}>
                      <ActionIcon
                        variant="transparent"
                        radius="xl"
                        size={32}
                        className="outline-icon-button"
                        onClick={handleOpenInBrowser}
                      >
                        <IconBrowserShare size={16} />
                      </ActionIcon>
                    </Tooltip>
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
                        border: PREVIEW_BORDER,
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
                  <Divider />
                </Box>

                <Box p="md">
                  <DocumentMetadata item={item} contentType={attachment?.contentType} />
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
                  <Divider />
                </Box>

                <Box p="md">
                  <DocumentMetadata item={item} contentType={attachment?.contentType} />
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

      <EditDocumentDetailsModal
        item={item}
        opened={editModalOpened}
        onClose={() => setEditModalOpened(false)}
        onSaved={onDocumentChange}
        onDeleted={onDocumentDeleted}
      />
    </>
  );
}

function getAttachment(doc: DocumentReference): Attachment | undefined {
  return doc.content?.[0]?.attachment;
}

function isPdfLike(attachment: Attachment | undefined): boolean {
  const ct = attachment?.contentType;
  if (!ct) {
    return false;
  }
  return ct === 'application/pdf' || ct === 'application/json' || ct.startsWith('text/');
}

function getAuthor(doc: DocumentReference): string | undefined {
  const author = doc.author?.[0];
  return author?.display ?? author?.reference;
}

function DocumentMetadata({
  item,
  contentType,
}: {
  item: WithId<DocumentReference>;
  contentType: string | undefined;
}): JSX.Element {
  const documentType = getDocumentTypeDisplay(item);
  const documentCategory =
    item.category
      ?.map((c) => c.coding?.[0]?.display || c.text)
      .filter(Boolean)
      .join(', ') || undefined;

  // Author row reflects the document's own author field; the Added/Last updated lines attribute to
  // the audit meta.author (original = oldest version, current = the loaded resource).
  const author = getAuthor(item);
  const currentAuthor = authorLabel(item.meta?.author);
  const lastUpdated = item.meta?.lastUpdated;
  const date = item.date || item.meta?.lastUpdated;

  return (
    <Stack gap="sm">
      {documentType && <MetadataRow label="Type" value={documentType} />}
      {documentCategory && <MetadataRow label="Category" value={documentCategory} />}
      {contentType && <MetadataRow label="Content type" value={contentType} />}
      <MetadataRow
        label="Author"
        value={
          author ?? (
            <Text span c="dimmed">
              No author attributed
            </Text>
          )
        }
      />
      {date && <MetadataRow label="Added" value={formatDate(date)} />}
      {lastUpdated && (
        <MetadataRow
          label="Last updated"
          value={
            <>
              {formatDate(lastUpdated)}
              {currentAuthor && <Text span>{` by ${currentAuthor}`}</Text>}
            </>
          }
        />
      )}
    </Stack>
  );
}

function authorLabel(ref: Reference | undefined): string | undefined {
  return ref?.display ?? ref?.reference;
}

function MetadataRow({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <Group align="flex-start" gap="lg" wrap="nowrap">
      <Text fw={500} size="sm" c="dimmed" style={{ width: '150px', flexShrink: 0 }}>
        {label}
      </Text>
      <Text size="sm" component="div" style={{ flex: 1, minWidth: 0 }}>
        {value}
      </Text>
    </Group>
  );
}

interface AttachmentPreviewProps {
  attachment: Attachment;
  url: string | undefined;
}

function AttachmentPreview({ attachment, url }: AttachmentPreviewProps): JSX.Element {
  const contentType = attachment.contentType;

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
            border: PREVIEW_BORDER,
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
            border: PREVIEW_BORDER,
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
