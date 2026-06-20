// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Divider, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import type {
  CodeableConcept,
  Communication,
  CommunicationPayload,
  DocumentReference,
  Reference,
} from '@medplum/fhirtypes';
import { CodeableConceptInput, ReferenceInput, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import type { PatientDocument } from './DocumentListItem.utils';

interface EditDocumentDetailsModalProps {
  item: PatientDocument;
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

// Resource references that can author a document or send a message.
const AUTHOR_TARGET_TYPES = ['Practitioner', 'Organization', 'Patient', 'RelatedPerson'];

export function EditDocumentDetailsModal({
  item,
  opened,
  onClose,
  onSaved,
  onDeleted,
}: EditDocumentDetailsModalProps): JSX.Element {
  const medplum = useMedplum();
  const isDocRef = item.resourceType === 'DocumentReference';

  // Editable field state, seeded from the resource. Inputs stay mounted while the delete
  // confirmation is shown (just visually hidden), so in-progress edits survive a cancel.
  const [name, setName] = useState(item.name);
  const [type, setType] = useState<CodeableConcept | undefined>(() =>
    isDocRef ? (item.resource as DocumentReference).type : undefined
  );
  const [category, setCategory] = useState<CodeableConcept | undefined>(() => getInitialCategory(item));
  const [authorRef, setAuthorRef] = useState<Reference | undefined>(() => getInitialAuthor(item));

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleClose = (): void => {
    setConfirmingDelete(false);
    onClose();
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const updated = buildUpdatedResource(item, { name, type, category, authorRef });
      await medplum.updateResource(updated);
      showSuccessNotification({ title: 'Success', message: 'Document details updated' });
      onSaved();
      handleClose();
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    setDeleting(true);
    try {
      // Soft delete: mark the resource entered-in-error so it stays in the Medplum project but is
      // filtered out of the provider's documents list (see fetchDocuments in DocumentsPage).
      if (item.resourceType === 'DocumentReference') {
        await medplum.updateResource<DocumentReference>({
          ...(item.resource as DocumentReference),
          status: 'entered-in-error',
        });
      } else {
        await medplum.updateResource<Communication>({
          ...(item.resource as Communication),
          status: 'entered-in-error',
        });
      }
      showSuccessNotification({ title: 'Success', message: 'Document deleted' });
      onDeleted();
      handleClose();
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setDeleting(false);
    }
  };

  const sourcePath = `${item.resourceType}`;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size={confirmingDelete ? 'md' : 'lg'}
      centered={confirmingDelete}
      title={confirmingDelete ? undefined : 'Edit Document Details'}
    >
      {opened && (
        <>
          {/* Edit form: kept mounted (only hidden) during delete confirmation so edits persist. */}
          <Box display={confirmingDelete ? 'none' : undefined}>
            <Stack gap="md">
              <Divider />

              <TextInput label="Title" value={name} onChange={(event) => setName(event.currentTarget.value)} />

              {isDocRef && (
                <CodeableConceptInput
                  name="type"
                  label="Type"
                  path={`${sourcePath}.type`}
                  binding="http://hl7.org/fhir/ValueSet/c80-doc-typecodes"
                  maxValues={1}
                  defaultValue={type}
                  onChange={(value) => setType(value)}
                />
              )}

              <CodeableConceptInput
                name="category"
                label="Category"
                path={`${sourcePath}.category`}
                binding="http://hl7.org/fhir/ValueSet/document-classcodes"
                maxValues={1}
                defaultValue={category}
                onChange={(value) => setCategory(value)}
              />

              <Box>
                <Text size="sm" fw={500} mb={4}>
                  Author
                </Text>
                <ReferenceInput
                  name="author"
                  targetTypes={AUTHOR_TARGET_TYPES}
                  defaultValue={authorRef}
                  onChange={(value) => setAuthorRef(value)}
                />
              </Box>

              <Divider />

              <Button variant="filled" w="100%" onClick={() => handleSave().catch(console.error)} loading={saving}>
                Save Changes
              </Button>
              <Button
                variant="outline"
                color="red"
                w="100%"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
              >
                Delete Document
              </Button>
            </Stack>
          </Box>

          {confirmingDelete && (
            <Stack gap="md">
              <Text>Are you sure you want to delete this document? This action cannot be undone.</Text>
              <Group justify="flex-end" gap="sm">
                <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button color="red" onClick={() => handleDelete().catch(console.error)} loading={deleting}>
                  Delete
                </Button>
              </Group>
            </Stack>
          )}
        </>
      )}
    </Modal>
  );
}

function getInitialCategory(item: PatientDocument): CodeableConcept | undefined {
  if (item.resourceType === 'DocumentReference') {
    return (item.resource as DocumentReference).category?.[0];
  }
  return (item.resource as Communication).category?.[0];
}

function getInitialAuthor(item: PatientDocument): Reference | undefined {
  if (item.resourceType === 'DocumentReference') {
    return (item.resource as DocumentReference).author?.[0];
  }
  return (item.resource as Communication).sender;
}

interface EditedFields {
  name: string;
  type: CodeableConcept | undefined;
  category: CodeableConcept | undefined;
  authorRef: Reference | undefined;
}

function buildUpdatedResource(item: PatientDocument, fields: EditedFields): DocumentReference | Communication {
  const { name, type, category, authorRef } = fields;
  const trimmedName = name.trim() || undefined;

  if (item.resourceType === 'DocumentReference') {
    const doc = item.resource as DocumentReference;
    const firstContent = doc.content?.[0];
    const content = firstContent
      ? [
          { ...firstContent, attachment: { ...firstContent.attachment, title: trimmedName } },
          ...(doc.content?.slice(1) ?? []),
        ]
      : doc.content;
    return {
      ...doc,
      description: trimmedName,
      type,
      category: category ? [category] : undefined,
      author: authorRef ? ([authorRef] as DocumentReference['author']) : undefined,
      content,
    };
  }

  const comm = item.resource as Communication;
  return {
    ...comm,
    category: category ? [category] : undefined,
    sender: authorRef as Communication['sender'],
    payload: buildCommPayload(comm, trimmedName),
  };
}

function buildCommPayload(comm: Communication, title: string | undefined): CommunicationPayload[] | undefined {
  if (!comm.payload?.length) {
    return comm.payload;
  }
  const payload = [...comm.payload];
  const idx = payload.findIndex((p) => p.contentAttachment);
  if (idx >= 0) {
    payload[idx] = {
      ...payload[idx],
      contentAttachment: { ...payload[idx].contentAttachment, title },
    };
  }
  return payload;
}
