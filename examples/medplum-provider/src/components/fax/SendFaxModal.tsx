// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Divider, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference, isNotFound, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import type { Attachment, Communication, Organization, Patient, Reference } from '@medplum/fhirtypes';
import { ResourceInput, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleOff, IconUpload } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

export interface SendFaxModalProps {
  opened: boolean;
  onClose: () => void;
  onFaxSent?: (fax: Communication) => void;
  defaultPatient?: Reference<Patient>;
  defaultAttachment?: Attachment;
}

export function SendFaxModal({
  opened,
  onClose,
  onFaxSent,
  defaultPatient,
  defaultAttachment,
}: SendFaxModalProps): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  const [recipientOrg, setRecipientOrg] = useState<Organization | undefined>(undefined);
  const [recipientName, setRecipientName] = useState('');
  const [faxNumber, setFaxNumber] = useState('');
  const [patient, setPatient] = useState(defaultPatient);
  const [subject, setSubject] = useState('');
  const [coverNote, setCoverNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (opened) {
      setRecipientOrg(undefined);
      setRecipientName('');
      setFaxNumber('');
      setPatient(defaultPatient);
      setSubject('');
      setCoverNote('');
      setFile(null);
      setIsSubmitting(false);
    }
  }, [opened, defaultPatient]);

  const handleOrgChange = (org: Organization | undefined): void => {
    setRecipientOrg(org);
    if (org) {
      const fax =
        org.telecom?.find((t) => t.system === 'fax')?.value ??
        org.contact?.flatMap((c) => c.telecom ?? []).find((t) => t.system === 'fax')?.value;
      if (fax) {
        setFaxNumber(fax);
      } else {
        setFaxNumber('');
        notifications.show({
          color: 'yellow',
          icon: <IconCircleOff />,
          title: 'No fax number',
          message: 'Selected organization has no fax number. Please enter one.',
        });
      }
    }
  };

  const handleSend = async (): Promise<void> => {
    if (!faxNumber.trim()) {
      if (recipientOrg) {
        notifications.show({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Validation Error',
          message: 'Selected organization has no fax number. Please enter one.',
        });
      } else {
        notifications.show({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Validation Error',
          message: 'A fax number is required.',
        });
      }
      return;
    }

    const digits = faxNumber.replace(/\D/g, '');
    if (digits.length < 10) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Validation Error',
        message: 'Fax number must have at least 10 digits',
      });
      return;
    }

    if (!file && !defaultAttachment) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Validation Error',
        message: 'Please select a file to fax',
      });
      return;
    }

    if (profile?.resourceType !== 'Practitioner') {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: 'Invalid practitioner profile',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let attachment: Attachment;
      if (defaultAttachment) {
        attachment = defaultAttachment;
      } else if (file) {
        attachment = await medplum.createAttachment({
          data: file,
          contentType: file.type,
          filename: file.name,
        });
      } else {
        return;
      }

      let recipient: Organization;
      if (recipientOrg) {
        recipient = recipientOrg;
      } else {
        recipient = await medplum.createResource<Organization>({
          resourceType: 'Organization',
          name: recipientName.trim() || 'Fax Recipient',
          contact: [{ telecom: [{ system: 'fax', value: digits }] }],
        });
      }

      const noteEntries: { text: string }[] = [];
      if (recipientName.trim()) {
        noteEntries.push({ text: `Attn: ${recipientName.trim()}` });
      }
      if (coverNote.trim()) {
        noteEntries.push({ text: coverNote });
      }

      const communication = await medplum.createResource<Communication>({
        resourceType: 'Communication',
        status: 'in-progress',
        category: [{ coding: [{ system: 'http://medplum.com/fhir/CodeSystem/fax-direction', code: 'outbound' }] }],
        medium: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
                code: 'FAXWRIT',
              },
            ],
          },
        ],
        subject: patient,
        sender: createReference(profile),
        recipient: [createReference(recipient)],
        payload: [{ contentAttachment: attachment }],
        topic: subject ? { text: subject } : undefined,
        note: noteEntries.length > 0 ? noteEntries : undefined,
      });

      const sendEfaxUrl = medplum.fhirUrl('Communication', '$send-efax');
      try {
        await medplum.post(sendEfaxUrl, communication);
      } catch (efaxErr) {
        if (efaxErr instanceof OperationOutcomeError && isNotFound(efaxErr.outcome)) {
          notifications.show({
            color: 'red',
            icon: <IconCircleOff />,
            title: 'Error',
            message: 'eFax integration not set up. Contact Medplum Support.',
          });
          return;
        }
        throw efaxErr;
      }

      notifications.show({
        color: 'green',
        icon: '✓',
        title: 'Fax sent successfully',
        message: '',
      });

      onFaxSent?.(communication);
      handleClose();
    } catch (error) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (): void => {
    setRecipientOrg(undefined);
    setRecipientName('');
    setFaxNumber('');
    setPatient(defaultPatient);
    setSubject('');
    setCoverNote('');
    setFile(null);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="lg"
      title="Send Fax"
      centered
      styles={{
        body: { padding: 0 },
        header: {
          padding: 'var(--mantine-spacing-md) var(--mantine-spacing-lg)',
          backgroundImage: `linear-gradient(var(--mantine-color-gray-2), var(--mantine-color-gray-2))`,
          backgroundSize: 'calc(100% - 2 * var(--mantine-spacing-lg)) 1px',
          backgroundPosition: 'center bottom',
          backgroundRepeat: 'no-repeat',
        },
      }}
    >
      <Stack h="100%" justify="space-between" gap={0}>
        <Box flex={1} miw={0}>
          <Stack gap="lg" p="lg">
            {!defaultAttachment && (
              <>
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    Document <span style={{ color: 'var(--mantine-color-red-6)' }}>*</span>
                  </Text>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    accept=".pdf,.png,.jpg,.jpeg,.tiff"
                    style={{ display: 'none' }}
                  />
                  <Box
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const dropped = e.dataTransfer.files?.[0];
                      if (dropped) {
                        setFile(dropped);
                      }
                    }}
                    style={{
                      border: `2px dashed ${isDragging ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-3)'}`,
                      borderRadius: 'var(--mantine-radius-md)',
                      padding: 'var(--mantine-spacing-xl) var(--mantine-spacing-md)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      backgroundColor: isDragging ? 'var(--mantine-color-blue-0)' : undefined,
                      transition: 'border-color 150ms ease, background-color 150ms ease',
                    }}
                  >
                    <Stack align="center" gap={4}>
                      <IconUpload
                        size={24}
                        color={file ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-5)'}
                      />
                      <Text size="sm" c={file ? undefined : 'dimmed'}>
                        {file ? file.name : 'Drag a file here or click to browse'}
                      </Text>
                      {!file && (
                        <Text size="xs" c="gray.5">
                          PDF, PNG, JPG, TIFF
                        </Text>
                      )}
                    </Stack>
                  </Box>
                </Stack>
                <Box py="xs">
                  <Divider />
                </Box>
              </>
            )}
            <TextInput
              label="Subject (optional)"
              placeholder="Enter subject"
              value={subject}
              onChange={(e) => setSubject(e.currentTarget.value)}
            />
            <Textarea
              label="Cover Page Note (optional)"
              placeholder="Enter cover page message..."
              value={coverNote}
              onChange={(e) => setCoverNote(e.currentTarget.value)}
              minRows={3}
              autosize
              maxRows={6}
            />
            <Box py="xs">
              <Divider />
            </Box>

            <ResourceInput<Organization>
              resourceType="Organization"
              name="recipientOrg"
              label="Recipient Organization (optional)"
              placeholder="Search for an organization..."
              onChange={handleOrgChange}
            />
            <TextInput
              label="Recipient Name (optional)"
              placeholder="Enter recipient name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.currentTarget.value)}
            />

            <TextInput
              label={
                <>
                  Fax Number <span style={{ color: 'var(--mantine-color-red-6)' }}>*</span>
                </>
              }
              placeholder="+1 (555) 123-4567"
              value={faxNumber}
              onChange={(e) => setFaxNumber(e.currentTarget.value)}
            />
            <ResourceInput<Patient>
              resourceType="Patient"
              name="patient"
              label="Patient (optional)"
              placeholder="Link to a patient..."
              defaultValue={defaultPatient}
              onChange={(value: Patient | undefined) => setPatient(value ? createReference(value) : undefined)}
            />
            <Box pt="xs">
              <Divider />
            </Box>
          </Stack>
        </Box>

        <Box px="lg" pb="lg">
          <Button variant="filled" w="100%" onClick={handleSend} loading={isSubmitting}>
            Send Fax
          </Button>
        </Box>
      </Stack>
    </Modal>
  );
}
