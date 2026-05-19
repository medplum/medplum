// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Divider, Flex, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { formatDateTime, getDisplayString } from '@medplum/core';
import type { Communication, Organization, Patient, Reference } from '@medplum/fhirtypes';
import { MedplumLink, useResource } from '@medplum/react';
import { useCachedBinaryUrl } from '@medplum/react-hooks';
import { IconDownload, IconSend, IconUserPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { AssignPatientModal } from './AssignPatientModal';
import { formatFaxNumber } from './fax.utils';
import classes from './FaxBoard.module.css';
import { SendFaxModal } from './SendFaxModal';

interface FaxDetailPanelProps {
  fax: Communication;
  onFaxChange: () => void;
}

export function FaxDetailPanel({ fax, onFaxChange }: FaxDetailPanelProps): JSX.Element {
  const patient = useResource(fax.subject);
  const [assignModalOpened, setAssignModalOpened] = useState(false);
  const [forwardModalOpened, setForwardModalOpened] = useState(false);

  const attachment = fax.payload?.find((p) => p.contentAttachment)?.contentAttachment;
  const rawAttachmentUrl = useCachedBinaryUrl(attachment?.url);
  const attachmentUrl = isValidUrl(rawAttachmentUrl) ? rawAttachmentUrl : undefined;
  const isInbound = fax.category?.[0]?.coding?.[0]?.code === 'inbound' || !fax.category?.[0]?.coding?.[0]?.code;
  const originatingFaxNumber = fax.extension?.find(
    (ext) => ext.url === 'https://efax.com/originating-fax-number'
  )?.valueString;

  const faxName = isInbound
    ? formatFaxNumber(fax.sender?.display || originatingFaxNumber || 'Unknown Sender')
    : formatFaxNumber(fax.recipient?.[0]?.display || 'Unknown recipient');

  const handleDownload = (): void => {
    if (!attachmentUrl) {
      return;
    }
    window.open(attachmentUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <Box h="100%" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }} className={classes.borderRight}>
        <Paper h="100%">
          <Flex direction="column" h="100%">
            <Box p="md">
              <Group justify="space-between" align="center">
                <Text fw={700} size="lg">
                  {faxName}
                </Text>

                <Group gap="xs">
                  {attachment?.url && (
                    <Tooltip label="Download" position="bottom" openDelay={500}>
                      <ActionIcon
                        variant="transparent"
                        radius="xl"
                        size={32}
                        className="outline-icon-button"
                        onClick={handleDownload}
                      >
                        <IconDownload size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Tooltip label="Assign Patient" position="bottom" openDelay={500}>
                    <ActionIcon
                      variant="transparent"
                      radius="xl"
                      size={32}
                      className="outline-icon-button"
                      onClick={() => setAssignModalOpened(true)}
                    >
                      <IconUserPlus size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Forward / Re-Fax" position="bottom" openDelay={500}>
                    <ActionIcon
                      variant="transparent"
                      radius="xl"
                      size={32}
                      className="outline-icon-button"
                      onClick={() => setForwardModalOpened(true)}
                    >
                      <IconSend size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Box>

            <Divider />

            {attachmentUrl && attachment?.contentType?.startsWith('image/') ? (
              <Box p="md" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
                <Box
                  style={{
                    display: 'block',
                    maxWidth: 'fit-content',
                    borderRadius: 4,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <img
                    src={attachmentUrl}
                    alt={attachment.title ?? 'Fax attachment'}
                    style={{ width: 'auto', maxWidth: '100%', height: 'auto', display: 'block' }}
                  />
                  <Box
                    style={{
                      position: 'absolute',
                      inset: 0,
                      border: '1px solid color-mix(in srgb, var(--mantine-color-gray-3) 50%, transparent)',
                      borderRadius: 4,
                      pointerEvents: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </Box>
              </Box>
            ) : (
              <Box p="md" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {attachmentUrl ? (
                  <Box
                    style={{
                      flex: 1,
                      borderRadius: 4,
                      overflow: 'hidden',
                      border: '1px solid color-mix(in srgb, var(--mantine-color-gray-3) 50%, transparent)',
                    }}
                  >
                    <iframe
                      title="Fax attachment"
                      width="100%"
                      height="100%"
                      src={attachmentUrl + '#navpanes=0'}
                      allowFullScreen={true}
                      style={{ display: 'block', border: 0 }}
                    />
                  </Box>
                ) : (
                  <Flex justify="center" align="center" h={300}>
                    <Text c="dimmed">No document attached to this fax</Text>
                  </Flex>
                )}
              </Box>
            )}

            <Box px="md">
              <Divider color="gray.1" />
            </Box>

            <Box p="md">
              <FaxMetadata
                fax={fax}
                isInbound={isInbound}
                originatingFaxNumber={originatingFaxNumber}
                patient={patient as Patient | undefined}
              />
            </Box>
          </Flex>
        </Paper>
      </Box>

      <AssignPatientModal
        opened={assignModalOpened}
        onClose={() => setAssignModalOpened(false)}
        resourceType="Communication"
        resourceId={fax.id ?? ''}
        onAssigned={onFaxChange}
        defaultPatient={patient ? { reference: `Patient/${patient.id}` } : undefined}
      />

      <SendFaxModal
        opened={forwardModalOpened}
        onClose={() => setForwardModalOpened(false)}
        onFaxSent={onFaxChange}
        defaultAttachment={attachment}
        defaultPatient={fax.subject as Reference<Patient> | undefined}
      />
    </>
  );
}

interface FaxMetadataProps {
  fax: Communication;
  isInbound: boolean;
  originatingFaxNumber: string | undefined;
  patient: Patient | undefined;
}

const METADATA_LABEL_WIDTH = 150;

function FaxMetadata({ fax, isInbound, originatingFaxNumber, patient }: FaxMetadataProps): JSX.Element {
  const recipient = useResource(fax.recipient?.[0]) as Organization | undefined;

  const recipientName = recipient?.name !== 'Fax Recipient' ? recipient?.name : undefined;
  const recipientFaxNumber =
    recipient?.telecom?.find((t) => t.system === 'fax')?.value ??
    recipient?.contact?.flatMap((c) => c.telecom ?? []).find((t) => t.system === 'fax')?.value;

  const attnNote = fax.note?.find((n) => n.text?.startsWith('Attn:'))?.text;
  const coverNote = fax.note?.find((n) => !n.text?.startsWith('Attn:'))?.text;

  return (
    <Stack
      gap="sm"
      style={{
        display: 'grid',
        gridTemplateColumns: `${METADATA_LABEL_WIDTH}px 1fr`,
        alignItems: 'start',
        columnGap: 'var(--mantine-spacing-lg)',
        rowGap: 'var(--mantine-spacing-sm)',
      }}
    >
      <Text fw={500} size="sm" c="dimmed">
        Direction
      </Text>
      <Text size="sm">{isInbound ? 'Inbound' : 'Outbound'}</Text>

      {(recipientFaxNumber || recipientName || attnNote) && (
        <>
          <Text fw={500} size="sm" c="dimmed">
            Recipient
          </Text>
          <Stack gap={0}>
            {recipientFaxNumber && <Text size="sm">{formatFaxNumber(recipientFaxNumber)}</Text>}
            {recipientName && <Text size="sm">{recipientName}</Text>}
            {attnNote && <Text size="sm">Attn: {attnNote.replace(/^Attn:\s*/, '')}</Text>}
          </Stack>
        </>
      )}
      {fax.sent && (
        <>
          <Text fw={500} size="sm" c="dimmed">
            {isInbound ? 'Received' : 'Sent'}
          </Text>
          <Text size="sm">{formatDateTime(fax.sent).replace(', ', ' · ')}</Text>
        </>
      )}
      {originatingFaxNumber && (
        <>
          <Text fw={500} size="sm" c="dimmed">
            Sender
          </Text>
          <Text size="sm">{formatFaxNumber(originatingFaxNumber)}</Text>
        </>
      )}
      <Text fw={500} size="sm" c="dimmed">
        Patient
      </Text>
      <Text size="sm">
        {patient ? (
          <MedplumLink to={`/Patient/${patient.id}/DocumentReference`}>{getDisplayString(patient)}</MedplumLink>
        ) : (
          'Unassigned'
        )}
      </Text>
      {coverNote && (
        <>
          <Text fw={500} size="sm" c="dimmed">
            Cover Page Note
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', minWidth: 0 }}>
            {coverNote}
          </Text>
        </>
      )}
    </Stack>
  );
}

function isValidUrl(url: string | undefined): url is string {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.href.length > 0;
  } catch {
    return false;
  }
}
