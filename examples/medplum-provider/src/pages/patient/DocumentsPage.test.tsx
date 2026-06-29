// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Binary, DocumentReference } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DocumentsPage } from './DocumentsPage';

const PATIENT_ID = HomerSimpson.id as string;

const MOCK_DOC: WithId<DocumentReference> = {
  resourceType: 'DocumentReference',
  id: 'doc-001',
  status: 'current',
  description: 'Lab Result PDF',
  date: '2024-05-01T12:00:00Z',
  content: [
    {
      attachment: {
        contentType: 'application/pdf',
        url: 'Binary/binary-001',
        title: 'lab-result.pdf',
      },
    },
  ],
  subject: { reference: `Patient/${PATIENT_ID}` },
};

describe('DocumentsPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (documentId?: string): ReturnType<typeof render> => {
    const path = documentId
      ? `/Patient/${PATIENT_ID}/DocumentReference/${documentId}`
      : `/Patient/${PATIENT_ID}/DocumentReference`;

    return render(
      <MemoryRouter initialEntries={[path]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/DocumentReference/:documentId" element={<DocumentsPage />} />
              <Route path="/Patient/:patientId/DocumentReference" element={<DocumentsPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('shows empty state when no documents', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);

    setup();

    await waitFor(() => {
      expect(screen.getByText('No documents to display.')).toBeInTheDocument();
    });
  });

  test('shows loading skeleton initially', async () => {
    medplum.searchResources = vi.fn().mockImplementation(() => new Promise(() => {}));

    setup();

    await waitFor(() => {
      const skeletons = document.querySelectorAll('.mantine-Skeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  test('renders document list item when documents are returned', async () => {
    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'DocumentReference') {
        return Promise.resolve([MOCK_DOC]);
      }
      return Promise.resolve([]);
    });

    setup(MOCK_DOC.id);

    await waitFor(() => {
      expect(screen.getAllByText('Lab Result PDF').length).toBeGreaterThanOrEqual(1);
    });
  });

  test('renders upload document button', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);

    setup();

    await waitFor(() => {
      expect(screen.getByText('All Documents')).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button');
    const uploadButton = buttons.find((btn) => btn.querySelector('.tabler-icon-plus'));
    expect(uploadButton).toBeInTheDocument();
  });

  test('renders filter documents button', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);

    setup();

    await waitFor(() => {
      expect(screen.getByText('All Documents')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Filter documents' })).toBeInTheDocument();
  });

  test('redirects to the first document when the documentId in the URL is not found', async () => {
    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'DocumentReference') {
        return Promise.resolve([MOCK_DOC]);
      }
      return Promise.resolve([]);
    });

    setup('nonexistent-doc-id');

    // The selection effect advances the URL to the first visible document, so its detail panel
    // renders. The content-type row appears only in the detail panel, not in the list item, so it
    // confirms the redirect resolved to a selected document rather than the empty placeholder.
    await waitFor(() => {
      expect(screen.getByText('application/pdf')).toBeInTheDocument();
    });
  });

  test('navigates to the next document on ArrowDown', async () => {
    const secondDoc: WithId<DocumentReference> = {
      ...MOCK_DOC,
      id: 'doc-002',
      description: 'Second Lab Result',
      date: '2024-05-02T12:00:00Z',
    };

    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'DocumentReference') {
        return Promise.resolve([MOCK_DOC, secondDoc]);
      }
      return Promise.resolve([]);
    });

    setup(MOCK_DOC.id);

    await waitFor(() => {
      expect(screen.getAllByText('Lab Result PDF').length).toBeGreaterThanOrEqual(1);
    });

    await userEvent.keyboard('{ArrowDown}');

    await waitFor(() => {
      expect(screen.getAllByText('Second Lab Result').length).toBeGreaterThanOrEqual(1);
    });
  });

  test('filters out Health Gorilla lab artifacts', async () => {
    const hgLabDoc: WithId<DocumentReference> = {
      resourceType: 'DocumentReference',
      id: 'hg-lab-doc',
      status: 'current',
      description: 'HG Lab Result',
      category: [
        {
          coding: [
            {
              system: 'https://www.medplum.com/integrations/health-gorilla/document-type',
              code: 'lab',
            },
          ],
        },
      ],
      content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/hg-001' } }],
    };

    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'DocumentReference') {
        return Promise.resolve([hgLabDoc, MOCK_DOC]);
      }
      return Promise.resolve([]);
    });

    setup(MOCK_DOC.id);

    await waitFor(() => {
      expect(screen.getAllByText('Lab Result PDF').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('HG Lab Result')).not.toBeInTheDocument();
    });
  });

  test('filters out documents carrying a Health Gorilla identifier', async () => {
    const hgIdentifiedDoc: WithId<DocumentReference> = {
      resourceType: 'DocumentReference',
      id: 'hg-identified-doc',
      status: 'current',
      description: 'HG Requisition',
      identifier: [{ system: 'https://www.healthgorilla.com', value: 'req-123' }],
      content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/hg-002' } }],
    };

    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'DocumentReference') {
        return Promise.resolve([hgIdentifiedDoc, MOCK_DOC]);
      }
      return Promise.resolve([]);
    });

    setup(MOCK_DOC.id);

    await waitFor(() => {
      expect(screen.getAllByText('Lab Result PDF').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('HG Requisition')).not.toBeInTheDocument();
    });
  });

  test('filters out Stedi artifacts by identifier host but keeps lookalike hosts', async () => {
    const stediDoc: WithId<DocumentReference> = {
      resourceType: 'DocumentReference',
      id: 'stedi-doc',
      status: 'current',
      description: 'Stedi Artifact',
      identifier: [{ system: 'https://stedi.com/claims', value: 'c-1' }],
      content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/stedi-001' } }],
    };
    // A lookalike host must NOT be treated as Stedi (guards the host-boundary match).
    const lookalikeDoc: WithId<DocumentReference> = {
      resourceType: 'DocumentReference',
      id: 'lookalike-doc',
      status: 'current',
      description: 'Lookalike Doc',
      identifier: [{ system: 'https://stedi.com.evil.example/claims', value: 'c-2' }],
      content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/look-001' } }],
    };

    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'DocumentReference') {
        return Promise.resolve([stediDoc, lookalikeDoc, MOCK_DOC]);
      }
      return Promise.resolve([]);
    });

    setup(MOCK_DOC.id);

    const listbox = await screen.findByRole('listbox', { name: 'All documents' });
    await waitFor(() => {
      expect(within(listbox).getByText('Lab Result PDF')).toBeInTheDocument();
      expect(within(listbox).getByText('Lookalike Doc')).toBeInTheDocument();
      expect(within(listbox).queryByText('Stedi Artifact')).not.toBeInTheDocument();
    });
  });

  test('uploads a selected file as a DocumentReference', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    const createBinary = vi
      .spyOn(medplum, 'createBinary')
      .mockResolvedValue({ resourceType: 'Binary', id: 'binary-xyz' } as WithId<Binary>);
    const createResource = vi
      .spyOn(medplum, 'createResource')
      .mockResolvedValue({ resourceType: 'DocumentReference', id: 'new-doc' } as WithId<DocumentReference>);

    setup();

    await waitFor(() => {
      expect(screen.getByText('All Documents')).toBeInTheDocument();
    });

    // The upload button only opens a native file picker, so drive the upload through the hidden
    // file input directly (which is what the picker would populate).
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'report.pdf', { type: 'application/pdf' });
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(createBinary).toHaveBeenCalled();
      expect(createResource).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'DocumentReference',
          status: 'current',
          description: 'report.pdf',
        })
      );
    });
  });

  test('soft-deletes a document by marking it entered-in-error', async () => {
    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'DocumentReference') {
        return Promise.resolve([MOCK_DOC]);
      }
      return Promise.resolve([]);
    });
    const updateResource = vi
      .spyOn(medplum, 'updateResource')
      .mockResolvedValue({ ...MOCK_DOC, status: 'entered-in-error' });

    setup(MOCK_DOC.id);

    await waitFor(() => {
      expect(screen.getAllByText('Lab Result PDF').length).toBeGreaterThanOrEqual(1);
    });

    // Open the edit modal via its icon button, then confirm the two-step delete.
    const editButton = screen.getAllByRole('button').find((btn) => btn.querySelector('.tabler-icon-edit-circle'));
    await userEvent.click(editButton as HTMLElement);

    await userEvent.click(await screen.findByText('Delete Document'));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(updateResource).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'DocumentReference', id: MOCK_DOC.id, status: 'entered-in-error' })
      );
    });
  });

  test('filters the document list by source', async () => {
    const labDoc: WithId<DocumentReference> = {
      ...MOCK_DOC,
      id: 'lab-doc',
      description: 'Lab Report Doc',
      date: '2024-05-03T12:00:00Z',
      type: { coding: [{ display: 'Lab Report' }] },
    };

    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'DocumentReference') {
        return Promise.resolve([MOCK_DOC, labDoc]);
      }
      return Promise.resolve([]);
    });

    setup(MOCK_DOC.id);

    const listbox = await screen.findByRole('listbox', { name: 'All documents' });
    await waitFor(() => {
      expect(within(listbox).getByText('Lab Result PDF')).toBeInTheDocument();
      expect(within(listbox).getByText('Lab Report Doc')).toBeInTheDocument();
    });

    // Open the filter menu and restrict to the "Lab" source.
    await userEvent.click(screen.getByRole('button', { name: 'Filter documents' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Lab' }));

    await waitFor(() => {
      const list = screen.getByRole('listbox', { name: 'All documents' });
      expect(within(list).getByText('Lab Report Doc')).toBeInTheDocument();
      // The Upload-source document is filtered out of the list (it remains selected in the detail
      // panel, so we scope this assertion to the list itself).
      expect(within(list).queryByText('Lab Result PDF')).not.toBeInTheDocument();
    });
  });
});
