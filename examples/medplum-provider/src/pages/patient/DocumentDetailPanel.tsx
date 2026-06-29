// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Divider, Flex, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatDate } from '@medplum/core';
import type { Attachment, Bundle, DocumentReference, Patient, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCachedBinaryUrl } from '@medplum/react-hooks';
import { IconBrowserShare, IconEditCircle, IconPrinter } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { SendFaxModal } from '../../components/fax/SendFaxModal';
import classes from './DocumentDetailPanel.module.css';
import { getDocumentName, getDocumentSource, getDocumentTypeDisplay } from './documentDisplay';
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
  // Documents whose original-author clause has already faded in this section visit. Owned by the
  // page so toggling between documents (or revisiting a cached one) doesn't re-animate.
  fadedAuthorIds: Set<string>;
}

export function DocumentDetailPanel({
  item,
  patientRef,
  onDocumentChange,
  onDocumentDeleted,
  fadedAuthorIds,
}: DocumentDetailPanelProps): JSX.Element {
  const medplum = useMedplum();
  const [faxModalOpened, setFaxModalOpened] = useState(false);
  const [editModalOpened, setEditModalOpened] = useState(false);
  // The original author comes from version history (oldest version's meta.author). It's loaded
  // async so the Added date renders immediately and the "by …" clause fades in as a fast-follow.
  const [originalAuthor, setOriginalAuthor] = useState<string | undefined>(undefined);

  const attachment = getAttachment(item);
  const attachmentUrl = useCachedBinaryUrl(attachment?.url);

  useEffect(() => {
    let cancelled = false;
    if (!item.id) {
      return undefined;
    }
    const historyUrl = medplum.fhirUrl(item.resourceType, item.id, '_history');
    historyUrl.searchParams.set('_count', '100');
    historyUrl.searchParams.set('_elements', 'id,meta');
    medplum
      .get(historyUrl)
      .then((bundle: Bundle) => {
        if (cancelled) {
          return;
        }
        const versions: Resource[] = [];
        for (const entry of bundle.entry ?? []) {
          if (entry.resource) {
            versions.push(entry.resource);
          }
        }
        versions.sort(
          (a, b) => new Date(a.meta?.lastUpdated ?? 0).getTime() - new Date(b.meta?.lastUpdated ?? 0).getTime()
        );
        setOriginalAuthor(authorLabel(versions[0]?.meta?.author));
      })
      .catch(() => {
        // Leave the original author unset; the Added date still renders on its own.
      });
    return () => {
      cancelled = true;
    };
  }, [medplum, item]);

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
                    {getDocumentName(item)}
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
                  <DocumentMetadata
                    item={item}
                    contentType={attachment?.contentType}
                    originalAuthor={originalAuthor}
                    fadedAuthorIds={fadedAuthorIds}
                  />
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
                  <DocumentMetadata
                    item={item}
                    contentType={attachment?.contentType}
                    originalAuthor={originalAuthor}
                    fadedAuthorIds={fadedAuthorIds}
                  />
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
  originalAuthor,
  fadedAuthorIds,
}: {
  item: WithId<DocumentReference>;
  contentType: string | undefined;
  originalAuthor: string | undefined;
  fadedAuthorIds: Set<string>;
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

  // Fade the "Added by …" clause in only the first time a document's author resolves this visit;
  // on revisits the history call is cached (resolves immediately), so render it statically to
  // avoid an out-of-place re-fade. The page-owned set records which documents have already faded.
  const [alreadyFaded] = useState(() => fadedAuthorIds.has(item.id));
  useEffect(() => {
    if (originalAuthor && item.id) {
      fadedAuthorIds.add(item.id);
    }
  }, [originalAuthor, item.id, fadedAuthorIds]);

  const addedAuthorClause = ` by ${originalAuthor}`;

  return (
    <Stack gap="sm">
      <MetadataRow label="Source" value={getDocumentSource(item)} />
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
      {date && (
        <MetadataRow
          label="Added"
          value={
            <>
              {formatDate(date)}
              {originalAuthor && (
                <Text span className={alreadyFaded ? undefined : classes.authorClauseFade}>
                  {addedAuthorClause}
                </Text>
              )}
            </>
          }
        />
      )}
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
