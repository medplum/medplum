// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { showErrorNotification } from '../../utils/notifications';
import type { UploadDocumentModalProps } from './UploadDocumentModal';
import { UploadDocumentModal } from './UploadDocumentModal';

vi.mock('../../utils/notifications');

const patientId = HomerSimpson.id as string;

describe('UploadDocumentModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (props: Partial<UploadDocumentModalProps> = {}): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <UploadDocumentModal opened={true} onClose={vi.fn()} patient={HomerSimpson} onCreated={vi.fn()} {...props} />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  // The file <input> is hidden and lives in the Modal's portal (outside the render container).
  const selectFile = (file: File): void => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  };

  test('renders the form when opened', () => {
    setup();
    expect(screen.getByText('Upload document')).toBeInTheDocument();
    expect(screen.getByText('Drag a file here or click to browse')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a description (optional)')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  test('renders nothing when closed', () => {
    setup({ opened: false });
    expect(screen.queryByText('Upload document')).not.toBeInTheDocument();
  });

  test('disables the Upload button until a file is selected', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();

    selectFile(new File(['data'], 'report.pdf', { type: 'application/pdf' }));

    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
  });

  test('creates a DocumentReference and notifies the parent on upload', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const createdDoc: WithId<DocumentReference> = {
      resourceType: 'DocumentReference',
      id: 'doc-1',
      status: 'current',
      content: [],
    };
    const createResource = vi.spyOn(medplum, 'createResource').mockResolvedValue(createdDoc);
    vi.spyOn(medplum, 'createAttachment').mockResolvedValue({
      contentType: 'application/pdf',
      url: 'Binary/abc',
      title: 'report.pdf',
    });

    setup({ onCreated, onClose });

    selectFile(new File(['data'], 'report.pdf', { type: 'application/pdf' }));
    await user.type(screen.getByPlaceholderText('Enter a description (optional)'), 'Visit summary');
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(createResource).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'DocumentReference',
          status: 'current',
          subject: expect.objectContaining({ reference: `Patient/${patientId}` }),
          description: 'Visit summary',
          content: [{ attachment: expect.objectContaining({ url: 'Binary/abc' }) }],
        })
      );
    });
    expect(onCreated).toHaveBeenCalledWith(createdDoc);
    expect(onClose).toHaveBeenCalled();
  });

  test('omits the description when left blank', async () => {
    const user = userEvent.setup();
    const createResource = vi.spyOn(medplum, 'createResource').mockResolvedValue({
      resourceType: 'DocumentReference',
      id: 'doc-blank',
      status: 'current',
      content: [],
    });
    vi.spyOn(medplum, 'createAttachment').mockResolvedValue({ contentType: 'text/plain', url: 'Binary/blank' });

    setup();
    selectFile(new File(['data'], 'notes.txt', { type: 'text/plain' }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(createResource).toHaveBeenCalledWith(expect.objectContaining({ description: undefined }));
    });
  });

  test('resolves a patient Reference via useResource and uses it as the subject', async () => {
    const user = userEvent.setup();
    // Pre-cache so useResource resolves the reference synchronously for a deterministic test.
    await medplum.readResource('Patient', patientId);
    const createResource = vi.spyOn(medplum, 'createResource').mockResolvedValue({
      resourceType: 'DocumentReference',
      id: 'doc-2',
      status: 'current',
      content: [],
    });
    vi.spyOn(medplum, 'createAttachment').mockResolvedValue({ contentType: 'text/plain', url: 'Binary/xyz' });

    setup({ patient: { reference: `Patient/${patientId}` } });

    selectFile(new File(['data'], 'notes.txt', { type: 'text/plain' }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(createResource).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.objectContaining({ reference: `Patient/${patientId}` }) })
      );
    });
  });

  test('shows an error and does not create when the patient has not resolved', async () => {
    const user = userEvent.setup();
    const createResource = vi.spyOn(medplum, 'createResource').mockResolvedValue({
      resourceType: 'DocumentReference',
      id: 'doc-none',
      status: 'current',
      content: [],
    });

    // A reference to a non-existent patient never resolves, so patientResource stays undefined.
    setup({ patient: { reference: 'Patient/does-not-exist' } });

    selectFile(new File(['data'], 'report.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalled();
    });
    expect(createResource).not.toHaveBeenCalled();
  });
});
