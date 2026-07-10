// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  test('pins the full search (filters, sort, count, total) into the URL', async () => {
    await createDocument();

    setup(`/Patient/${patientId}/DocumentReference`);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining('_sort=-_lastUpdated'), { replace: true });
    });
    const url = navigatedUrls().find((u) => u.includes('_sort=-_lastUpdated')) as string;
    expect(url).toContain('_count=20');
    expect(url).toContain('_total=accurate');
    expect(url).toContain('status:not=entered-in-error');
    // The patient is carried by the path, so the subject filter stays out of the query string.
    expect(url).not.toContain('subject=');
  });

  const LAB_FILTER_PARAM = `identifier=${encodeURIComponent('https://www.healthgorilla.com|')}`;
  const OTHER_FILTER_PARAM = `identifier:not=${encodeURIComponent('https://www.healthgorilla.com|')}`;

  const navigatedUrls = (): string[] =>
    (navigateMock as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0] as unknown)
      .filter((url): url is string => typeof url === 'string');

  test('filter menu lists the document sources', async () => {
    await createDocument();

    setup(`/Patient/${patientId}/DocumentReference?_sort=-_lastUpdated`);

    fireEvent.click(await screen.findByRole('button', { name: 'Filter documents' }));

    expect(await screen.findByText('Document Source')).toBeInTheDocument();
    expect(screen.getByText('Lab')).toBeInTheDocument();
    expect(screen.getByText('Other Documents')).toBeInTheDocument();
  });

  test('selecting Lab navigates with the identifier filter and resets pagination', async () => {
    await createDocument();

    setup(`/Patient/${patientId}/DocumentReference?_offset=20&_sort=-_lastUpdated`);

    fireEvent.click(await screen.findByRole('button', { name: 'Filter documents' }));
    fireEvent.click(await screen.findByText('Lab'));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining(LAB_FILTER_PARAM));
    });
    const url = navigatedUrls().find((u) => u.includes(LAB_FILTER_PARAM)) as string;
    expect(url.startsWith(`/Patient/${patientId}/DocumentReference?`)).toBe(true);
    expect(url).not.toContain('_offset');
  });

  test('selecting Other Documents navigates with the not-Health-Gorilla and missing-related filters', async () => {
    await createDocument();

    setup(`/Patient/${patientId}/DocumentReference?_sort=-_lastUpdated`);

    fireEvent.click(await screen.findByRole('button', { name: 'Filter documents' }));
    fireEvent.click(await screen.findByText('Other Documents'));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining(OTHER_FILTER_PARAM));
    });
    const url = navigatedUrls().find((u) => u.includes(OTHER_FILTER_PARAM)) as string;
    expect(url).toContain('related:missing=true');
  });

  test('the Lab filter narrows the list to Health Gorilla documents', async () => {
    await createDocument({ identifier: [{ system: 'https://www.healthgorilla.com', value: 'hg-123' }] });
    await createDocument();

    setup(`/Patient/${patientId}/DocumentReference?_sort=-_lastUpdated&${LAB_FILTER_PARAM}`);

    // The active source is reflected in the list header, and only the HG doc is listed.
    expect(await screen.findByText('Lab Documents')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1));
  });

  test('the Other Documents filter keeps non-Health-Gorilla documents visible', async () => {
    // A doc with an unrelated identifier is not a lab doc, so it belongs under Other Documents.
    await createDocument({ identifier: [{ system: 'https://example.com', value: 'ext-1' }] });
    await createDocument(); // plain upload: no identifier
    await createDocument({ identifier: [{ system: 'https://www.healthgorilla.com', value: 'hg-123' }] });

    setup(`/Patient/${patientId}/DocumentReference?_sort=-_lastUpdated&${OTHER_FILTER_PARAM}&related:missing=true`);

    expect(await screen.findByText('Other Documents')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
  });

  test('reselecting the active source clears the filter', async () => {
    await createDocument();

    setup(`/Patient/${patientId}/DocumentReference?_sort=-_lastUpdated&${LAB_FILTER_PARAM}`);

    expect(await screen.findByText('Lab Documents')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filter documents' }));
    fireEvent.click(await screen.findByText('Lab'));

    await waitFor(() => {
      const cleared = navigatedUrls().find(
        (u) => u.startsWith(`/Patient/${patientId}/DocumentReference?`) && !u.includes('identifier')
      );
      expect(cleared).toBeDefined();
    });
  });
});
