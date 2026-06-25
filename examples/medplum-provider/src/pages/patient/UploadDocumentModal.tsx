// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Divider, Modal, Stack, Text, TextInput } from '@mantine/core';
import type { CodeableConcept, DocumentReference } from '@medplum/fhirtypes';
import { CodeableConceptInput, useMedplum } from '@medplum/react';
import { IconUpload } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useRef, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';

export interface UploadDocumentModalProps {
  opened: boolean;
  onClose: () => void;
  patientId: string;
  onCreated: (doc: DocumentReference) => void;
}

export function UploadDocumentModal({ opened, onClose, patientId, onCreated }: UploadDocumentModalProps): JSX.Element {
  const medplum = useMedplum();

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<CodeableConcept | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on close so the next open starts clean (avoids setState-in-effect).
  const handleClose = (): void => {
    setFile(null);
    setIsDragging(false);
    setDescription('');
    setType(undefined);
    setIsSubmitting(false);
    onClose();
  };

  const handleUpload = async (): Promise<void> => {
    if (!file) {
      showErrorNotification(new Error('Please select a file to upload.'));
      return;
    }

    setIsSubmitting(true);
    try {
      const attachment = await medplum.createAttachment({
        data: file,
        contentType: file.type,
        filename: file.name,
      });

      const doc = await medplum.createResource<DocumentReference>({
        resourceType: 'DocumentReference',
        status: 'current',
        subject: { reference: `Patient/${patientId}` },
        description: description.trim() || undefined,
        type,
        content: [{ attachment }],
      });
      onCreated(doc);
      handleClose();
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Upload document" centered size="lg">
      <Stack gap="md">
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            File <span style={{ color: 'var(--mantine-color-red-6)' }}>*</span>
          </Text>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
              <IconUpload size={24} color={file ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-5)'} />
              <Text size="sm" c={file ? undefined : 'dimmed'}>
                {file ? file.name : 'Drag a file here or click to browse'}
              </Text>
            </Stack>
          </Box>
        </Stack>

        <TextInput
          label="Description"
          placeholder="Enter a description (optional)"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />

        <CodeableConceptInput
          name="type"
          path="DocumentReference.type"
          label="Type"
          placeholder="Select a document type (optional)"
          binding="http://hl7.org/fhir/ValueSet/c80-doc-typecodes"
          maxValues={1}
          onChange={setType}
        />

        <Divider />

        <Button variant="filled" onClick={handleUpload} loading={isSubmitting} disabled={!file}>
          Upload
        </Button>
      </Stack>
    </Modal>
  );
}
