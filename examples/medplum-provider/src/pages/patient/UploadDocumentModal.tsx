// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Divider, Modal, Stack, Text, TextInput } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { CodeableConcept, DocumentReference, Patient, Reference } from '@medplum/fhirtypes';
import { CodeableConceptInput, useMedplum, useResource } from '@medplum/react';
import { IconUpload } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { useRef, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import classes from './UploadDocumentModal.module.css';

export interface UploadDocumentModalProps {
  opened: boolean;
  onClose: () => void;
  patient: Reference<Patient> | Patient;
  onCreated: (doc: DocumentReference) => void;
}

export function UploadDocumentModal({ opened, onClose, patient, onCreated }: UploadDocumentModalProps): JSX.Element {
  const medplum = useMedplum();
  const patientResource = useResource(patient);

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

    if (!patientResource) {
      showErrorNotification(new Error('Patient is not loaded yet. Please try again.'));
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
        subject: createReference(patientResource),
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
            File <span className={classes.required}>*</span>
          </Text>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={classes.hiddenInput}
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
            className={cx(classes.dropzone, isDragging && classes.dropzoneDragging)}
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
