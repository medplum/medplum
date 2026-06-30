// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Divider, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { CodeableConcept, DocumentReference, Reference } from '@medplum/fhirtypes';
import { CodeableConceptInput, ReferenceInput, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

interface EditDocumentDetailsModalProps {
  item: WithId<DocumentReference>;
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

  // Editable field state, seeded from the resource. Inputs stay mounted while the delete
  // confirmation is shown (just visually hidden), so in-progress edits survive a cancel.
  const [description, setDescription] = useState(() => item.description ?? '');
  const [type, setType] = useState<CodeableConcept | undefined>(() => item.type);
  const [category, setCategory] = useState<CodeableConcept | undefined>(() => getInitialCategory(item));
  const [authorRef, setAuthorRef] = useState<Reference | undefined>(() => getInitialAuthor(item));

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // The modal stays mounted between opens (the parent only toggles `opened`), so the lazy state
  // initializers above run only once. Re-seed every field from `item` each time the modal opens so
  // a previous session's unsaved edits don't carry over. This runs during render — before the
  // `{opened && ...}` form remounts — so the uncontrolled inputs (CodeableConceptInput,
  // ReferenceInput) pick up the fresh defaultValue; a useEffect would fire too late for those.
  const [prevOpened, setPrevOpened] = useState(opened);
  if (opened !== prevOpened) {
    setPrevOpened(opened);
    if (opened) {
      setDescription(item.description ?? '');
      setType(item.type);
      setCategory(getInitialCategory(item));
      setAuthorRef(getInitialAuthor(item));
      setConfirmingDelete(false);
    }
  }

  const handleClose = (): void => {
    setConfirmingDelete(false);
    onClose();
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const updated = buildUpdatedResource(item, { description, type, category, authorRef });
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
      // filtered out of the provider's documents list (see the status:not=entered-in-error filter
      // in the search memo in DocumentsPage).
      await medplum.updateResource<DocumentReference>({
        ...item,
        status: 'entered-in-error',
      });
      showSuccessNotification({ title: 'Success', message: 'Document deleted' });
      onDeleted();
      handleClose();
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setDeleting(false);
    }
  };

  const sourcePath = item.resourceType;

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

              <TextInput
                label="Description"
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />

              <CodeableConceptInput
                name="type"
                label="Type"
                path={`${sourcePath}.type`}
                binding="http://hl7.org/fhir/ValueSet/c80-doc-typecodes"
                maxValues={1}
                defaultValue={type}
                onChange={(value) => setType(value)}
              />

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

function getInitialCategory(doc: DocumentReference): CodeableConcept | undefined {
  return doc.category?.[0];
}

function getInitialAuthor(doc: DocumentReference): Reference | undefined {
  return doc.author?.[0];
}

interface EditedFields {
  description: string;
  type: CodeableConcept | undefined;
  category: CodeableConcept | undefined;
  authorRef: Reference | undefined;
}

function buildUpdatedResource(doc: DocumentReference, fields: EditedFields): DocumentReference {
  const { description, type, category, authorRef } = fields;

  return {
    ...doc,
    description: description.trim() || undefined,
    type,
    category: category ? [category] : undefined,
    author: authorRef ? ([authorRef] as DocumentReference['author']) : undefined,
  };
}
