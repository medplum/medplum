// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import type { NavigateFunction } from 'react-router';
import * as reactRouter from 'react-router';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DocumentsPage } from './DocumentsPage';

vi.mock('../../utils/notifications');

const patientId = HomerSimpson.id as string;

describe('DocumentsPage', () => {
  let medplum: MockClient;
  let navigateMock: NavigateFunction;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    // Mock navigation so the page's redirects/selections don't change the route under test.
    navigateMock = vi.fn() as NavigateFunction;
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateMock);
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

  const setup = (url: string): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Routes>
              <Route path="/Patient/:patientId/DocumentReference" element={<DocumentsPage />} />
              <Route path="/Patient/:patientId/DocumentReference/:documentId" element={<DocumentsPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('lists the patient documents', async () => {
    await createDocument();
    await createDocument();

    setup(`/Patient/${patientId}/DocumentReference?_sort=-_lastUpdated`);

    expect(await screen.findByText('All Documents')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
  });

  test('shows the empty state when there are no documents', async () => {
    setup(`/Patient/${patientId}/DocumentReference?_sort=-_lastUpdated`);

    expect(await screen.findByText('No documents.')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  test('hides soft-deleted (entered-in-error) documents', async () => {
    await createDocument();
    await createDocument({ status: 'entered-in-error' });

    setup(`/Patient/${patientId}/DocumentReference?_sort=-_lastUpdated`);

    // Only the 'current' document should be listed; the entered-in-error one is filtered out.
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1));
  });

  test('renders the detail panel for the selected document', async () => {
    const doc = await createDocument({ type: { coding: [{ display: 'Lab Report' }] } });

    setup(`/Patient/${patientId}/DocumentReference/${doc.id}?_sort=-_lastUpdated`);

    // Author/Added are metadata labels rendered only by the detail panel.
    expect(await screen.findByText('Author')).toBeInTheDocument();
    expect(screen.getByText('Added')).toBeInTheDocument();
  });

  test('pins the default sort into the URL when none is present', async () => {
    await createDocument();

    setup(`/Patient/${patientId}/DocumentReference`);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining('_sort=-_lastUpdated'), { replace: true });
    });
  });
});
