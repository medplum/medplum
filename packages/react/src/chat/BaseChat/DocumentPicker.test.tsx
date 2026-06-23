// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Menu } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getReferenceString } from '@medplum/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../../test-utils/render';
import type { DocumentPickerListProps } from './DocumentPicker';
import { DocumentPickerList, truncateMiddle } from './DocumentPicker';

vi.mock(import('@mantine/notifications'), async (importOriginal) => ({
  ...(await importOriginal()),
  showNotification: vi.fn(),
}));

describe('DocumentPickerList', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient({ profile: DrAliceSmith });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function setup(props: DocumentPickerListProps): Promise<void> {
    await act(async () =>
      render(
        <Menu opened>
          <DocumentPickerList {...props} />
        </Menu>,
        ({ children }: { children: ReactNode }) => (
          <MemoryRouter>
            <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
          </MemoryRouter>
        )
      )
    );
  }

  async function flushDebounce(): Promise<void> {
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
  }

  test('Shows Recent Documents label', async () => {
    await setup({ onSelect: vi.fn() });
    expect(screen.getByText('Recent Documents')).toBeInTheDocument();
  });

  test('Focuses the search input on mount', async () => {
    await setup({ onSelect: vi.fn() });
    expect(screen.getByPlaceholderText('Search documents...')).toHaveFocus();
  });

  test('Shows No documents found when no results', async () => {
    await setup({ onSelect: vi.fn() });
    await flushDebounce();
    expect(await screen.findByText('No documents found')).toBeInTheDocument();
  });

  test('Shows list of DocumentReferences using description', async () => {
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      description: 'Blood test results',
      content: [{ attachment: { title: 'blood-test.pdf' } }],
    });

    await setup({ onSelect: vi.fn() });
    await flushDebounce();

    expect(await screen.findByText('Blood test results')).toBeInTheDocument();
  });

  test('Falls back to attachment title when description is missing', async () => {
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      content: [{ attachment: { title: 'xray.pdf' } }],
    });

    await setup({ onSelect: vi.fn() });
    await flushDebounce();

    expect(await screen.findByText('xray.pdf')).toBeInTheDocument();
  });

  test('Calls onSelect with the document when a document is clicked', async () => {
    const onSelect = vi.fn();
    const doc = await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      description: 'Radiology report',
      content: [{ attachment: { title: 'radiology.pdf' } }],
    });

    await setup({ onSelect });
    await flushDebounce();

    const docButton = await screen.findByText('Radiology report');
    await act(async () => fireEvent.click(docButton));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: doc.id }));
  });

  test('Passes subject filter to search when subjectRef provided', async () => {
    const subjectRef = createReference(HomerSimpson);
    const searchSpy = vi.spyOn(medplum, 'searchResources').mockImplementation(() => Promise.resolve([]) as never);

    await setup({ onSelect: vi.fn(), subjectRef });
    await flushDebounce();

    await waitFor(() => expect(searchSpy).toHaveBeenCalled());

    const [resourceType, params] = searchSpy.mock.calls[0];
    expect(resourceType).toBe('DocumentReference');
    expect((params as URLSearchParams).get('subject')).toBe(getReferenceString(subjectRef));

    searchSpy.mockRestore();
  });

  test('Does not pass subject filter when subjectRef is not provided', async () => {
    const searchSpy = vi.spyOn(medplum, 'searchResources').mockImplementation(() => Promise.resolve([]) as never);

    await setup({ onSelect: vi.fn() });
    await flushDebounce();

    await waitFor(() => expect(searchSpy).toHaveBeenCalled());

    const [, params] = searchSpy.mock.calls[0];
    expect((params as URLSearchParams).get('subject')).toBeNull();

    searchSpy.mockRestore();
  });

  test('Filters results client-side when searching', async () => {
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      description: 'Blood test results',
      content: [{ attachment: { title: 'results.pdf' } }],
    });
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      content: [{ attachment: { title: 'xray.pdf' } }],
    });
    const searchSpy = vi.spyOn(medplum, 'searchResources');

    await setup({ onSelect: vi.fn() });
    await flushDebounce();
    expect(await screen.findByText('Blood test results')).toBeInTheDocument();

    act(() => {
      fireEvent.change(screen.getByPlaceholderText('Search documents...'), { target: { value: 'blood' } });
    });
    await flushDebounce();

    // The matching title-only doc is filtered out; the description match remains
    expect(screen.getByText('Blood test results')).toBeInTheDocument();
    expect(screen.queryByText('xray.pdf')).not.toBeInTheDocument();

    // A search request widens the page size so client-side filtering has results to work with
    const searchCall = searchSpy.mock.calls.at(-1);
    expect((searchCall?.[1] as URLSearchParams).get('_count')).toBe('50');

    searchSpy.mockRestore();
  });

  test('Shows an error notification when the search fails', async () => {
    vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('boom'));

    await setup({ onSelect: vi.fn() });
    await flushDebounce();

    await waitFor(() => expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' })));
  });
});

describe('truncateMiddle', () => {
  test('returns the name unchanged when within the limit', () => {
    expect(truncateMiddle('short.pdf', 24)).toBe('short.pdf');
  });

  test('middle-truncates a long name while keeping the extension', () => {
    const result = truncateMiddle('a-very-long-document-name.pdf', 20);
    expect(result).toContain('….');
    expect(result.endsWith('pdf')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  test('truncates with a trailing ellipsis when there is no extension', () => {
    expect(truncateMiddle('a-very-long-name-without-extension', 10)).toBe('a-very-lo…');
  });

  test('truncates with a trailing ellipsis when the extension leaves no room', () => {
    expect(truncateMiddle('ab.superlongextension', 8)).toBe('ab.supe…');
  });
});
