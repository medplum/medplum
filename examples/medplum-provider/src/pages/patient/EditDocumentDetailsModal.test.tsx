// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import { EditDocumentDetailsModal } from './EditDocumentDetailsModal';

vi.mock('../../utils/notifications');

const patientId = HomerSimpson.id as string;

describe('EditDocumentDetailsModal', () => {
  let medplum: MockClient;
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const createDocument = async (overrides: Partial<DocumentReference> = {}): Promise<WithId<DocumentReference>> => {
    return medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      subject: { reference: `Patient/${patientId}` },
      content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/example', title: 'file.pdf' } }],
      ...overrides,
    });
  };

  const setup = (item: WithId<DocumentReference>, opened = true): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <EditDocumentDetailsModal
            item={item}
            opened={opened}
            onClose={onClose}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  test('Renders the edit form seeded from the resource', async () => {
    const item = await createDocument({ description: 'Discharge summary' });
    setup(item);

    expect(screen.getByText('Edit Document Details')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue('Discharge summary');
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Author')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Document' })).toBeInTheDocument();
  });

  test('Renders an empty description when the resource has none', async () => {
    const item = await createDocument();
    setup(item);

    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  test('Renders no form content while closed', async () => {
    const item = await createDocument({ description: 'Discharge summary' });
    setup(item, false);

    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();
  });

  test('Saves the edited description', async () => {
    const item = await createDocument({ description: 'Old description' });
    const updateResource = vi.spyOn(medplum, 'updateResource');
    setup(item);

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New description' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    });

    await waitFor(() => {
      expect(updateResource).toHaveBeenCalledWith(
        expect.objectContaining({ id: item.id, description: 'New description' })
      );
    });
    expect(showSuccessNotification).toHaveBeenCalledWith({ title: 'Success', message: 'Document details updated' });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test('Clears a whitespace-only description', async () => {
    const item = await createDocument({ description: 'Old description' });
    const updateResource = vi.spyOn(medplum, 'updateResource');
    setup(item);

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '   ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    });

    await waitFor(() => {
      expect(updateResource).toHaveBeenCalledWith(expect.objectContaining({ description: undefined }));
    });
  });

  test('Preserves the existing type, category, and author when nothing is edited', async () => {
    const item = await createDocument({
      description: 'Discharge summary',
      type: { coding: [{ system: 'http://loinc.org', code: '18842-5', display: 'Discharge summary' }] },
      category: [{ coding: [{ system: 'http://loinc.org', code: '47039-3' }] }],
      author: [{ reference: `Patient/${patientId}` }],
    });
    const updateResource = vi.spyOn(medplum, 'updateResource');
    setup(item);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    });

    await waitFor(() => {
      expect(updateResource).toHaveBeenCalledWith(
        expect.objectContaining({
          type: item.type,
          category: item.category,
          author: item.author,
        })
      );
    });
  });

  test('Reports a save failure without closing', async () => {
    const item = await createDocument({ description: 'Discharge summary' });
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(new Error('Save failed'));
    setup(item);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    });

    await waitFor(() => expect(showErrorNotification).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('Asks for confirmation before deleting', async () => {
    const item = await createDocument();
    setup(item);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Document' }));

    expect(screen.getByText(/Are you sure you want to delete this document/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByText('Edit Document Details')).not.toBeInTheDocument();
  });

  test('Keeps in-progress edits when the delete confirmation is cancelled', async () => {
    const item = await createDocument({ description: 'Old description' });
    setup(item);

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Edited but unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Document' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // The form stays mounted behind the confirmation, so the edit survives.
    expect(screen.getByLabelText('Description')).toHaveValue('Edited but unsaved');
    expect(screen.queryByText(/Are you sure you want to delete this document/)).not.toBeInTheDocument();
  });

  test('Soft deletes the document as entered-in-error', async () => {
    const item = await createDocument();
    const updateResource = vi.spyOn(medplum, 'updateResource');
    setup(item);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Document' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });

    await waitFor(() => {
      expect(updateResource).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, status: 'entered-in-error' }));
    });
    expect(showSuccessNotification).toHaveBeenCalledWith({ title: 'Success', message: 'Document deleted' });
    expect(onDeleted).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test('Reports a delete failure and keeps the confirmation open', async () => {
    const item = await createDocument();
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(new Error('Delete failed'));
    setup(item);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Document' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });

    await waitFor(() => expect(showErrorNotification).toHaveBeenCalled());
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Are you sure you want to delete this document/)).toBeInTheDocument();
  });

  test('Re-seeds every field when the modal is reopened', async () => {
    const item = await createDocument({ description: 'Original' });
    const { rerender } = setup(item);

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Unsaved edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Document' }));

    const view = (opened: boolean): JSX.Element => (
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <EditDocumentDetailsModal
            item={item}
            opened={opened}
            onClose={onClose}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        </MantineProvider>
      </MedplumProvider>
    );

    // The parent only toggles `opened`; the modal stays mounted between opens.
    rerender(view(false));
    rerender(view(true));

    expect(screen.getByLabelText('Description')).toHaveValue('Original');
    expect(screen.queryByText(/Are you sure you want to delete this document/)).not.toBeInTheDocument();
  });

  test('Closes without saving', async () => {
    const item = await createDocument({ description: 'Discharge summary' });
    const updateResource = vi.spyOn(medplum, 'updateResource');
    setup(item);

    // Mantine's modal close button carries no accessible name, so target it by class.
    fireEvent.click(document.querySelector('.mantine-Modal-close') as HTMLElement);

    expect(onClose).toHaveBeenCalled();
    expect(updateResource).not.toHaveBeenCalled();
  });
});
