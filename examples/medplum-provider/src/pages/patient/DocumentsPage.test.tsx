// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
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

  test('renders sort toggle button', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);

    setup();

    await waitFor(() => {
      expect(screen.getByText('All Documents')).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button');
    const sortButton = buttons.find(
      (btn) => btn.querySelector('.tabler-icon-sort-descending') || btn.querySelector('.tabler-icon-sort-ascending')
    );
    expect(sortButton).toBeInTheDocument();
  });

  test('shows no document selected state when documentId not found', async () => {
    medplum.searchResources = vi.fn().mockImplementation((resourceType: string) => {
      if (resourceType === 'DocumentReference') {
        return Promise.resolve([MOCK_DOC]);
      }
      return Promise.resolve([]);
    });

    setup('nonexistent-doc-id');

    await waitFor(() => {
      expect(screen.getByText('No document selected')).toBeInTheDocument();
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
});
