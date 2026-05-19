// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, getReferenceString } from '@medplum/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../../test-utils/render';
import type { DocumentPickerProps } from './DocumentPicker';
import { DocumentPicker } from './DocumentPicker';

describe('DocumentPicker', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient({ profile: DrAliceSmith });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function setup(props: DocumentPickerProps): Promise<void> {
    await act(async () =>
      render(<DocumentPicker {...props} />, ({ children }: { children: ReactNode }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      ))
    );
  }

  async function flushDebounce(): Promise<void> {
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
  }

  test('Shows header, search input, and upload option', async () => {
    await setup({ onSelect: jest.fn(), onUpload: jest.fn() });
    expect(screen.getByText('Attachments')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search for a Document...')).toBeInTheDocument();
    expect(screen.getByText('Upload an image, pdf, etc.')).toBeInTheDocument();
  });

  test('Shows No documents found when no results', async () => {
    await setup({ onSelect: jest.fn(), onUpload: jest.fn() });
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

    await setup({ onSelect: jest.fn(), onUpload: jest.fn() });
    await flushDebounce();

    expect(await screen.findByText('Blood test results')).toBeInTheDocument();
  });

  test('Falls back to attachment title when description is missing', async () => {
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      content: [{ attachment: { title: 'xray.pdf' } }],
    });

    await setup({ onSelect: jest.fn(), onUpload: jest.fn() });
    await flushDebounce();

    expect(await screen.findByText('xray.pdf')).toBeInTheDocument();
  });

  test('Calls onSelect with the document when a document is clicked', async () => {
    const onSelect = jest.fn();
    const doc = await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      description: 'Radiology report',
      content: [{ attachment: { title: 'radiology.pdf' } }],
    });

    await setup({ onSelect, onUpload: jest.fn() });
    await flushDebounce();

    const docButton = await screen.findByText('Radiology report');
    await act(async () => fireEvent.click(docButton));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: doc.id }));
  });

  test('Calls onUpload when upload option is clicked', async () => {
    const onUpload = jest.fn();
    await setup({ onSelect: jest.fn(), onUpload });

    await act(async () => fireEvent.click(screen.getByText('Upload an image, pdf, etc.')));

    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  test('Passes subject filter to search when subjectRef provided', async () => {
    const subjectRef = createReference(HomerSimpson);
    const searchSpy = jest.spyOn(medplum, 'searchResources').mockImplementation(() => Promise.resolve([]) as never);

    await setup({ onSelect: jest.fn(), onUpload: jest.fn(), subjectRef });
    await flushDebounce();

    await waitFor(() => expect(searchSpy).toHaveBeenCalled());

    const [resourceType, params] = searchSpy.mock.calls[0];
    expect(resourceType).toBe('DocumentReference');
    expect((params as URLSearchParams).get('subject')).toBe(getReferenceString(subjectRef));

    searchSpy.mockRestore();
  });

  test('Does not pass subject filter when subjectRef is not provided', async () => {
    const searchSpy = jest.spyOn(medplum, 'searchResources').mockImplementation(() => Promise.resolve([]) as never);

    await setup({ onSelect: jest.fn(), onUpload: jest.fn() });
    await flushDebounce();

    await waitFor(() => expect(searchSpy).toHaveBeenCalled());

    const [, params] = searchSpy.mock.calls[0];
    expect((params as URLSearchParams).get('subject')).toBeNull();

    searchSpy.mockRestore();
  });

  test('Passes description:contains filter when searching', async () => {
    const searchSpy = jest.spyOn(medplum, 'searchResources').mockImplementation(() => Promise.resolve([]) as never);

    await setup({ onSelect: jest.fn(), onUpload: jest.fn() });
    await flushDebounce();
    searchSpy.mockClear();

    act(() => {
      fireEvent.change(screen.getByPlaceholderText('Search for a Document...'), {
        target: { value: 'blood' },
      });
    });
    await flushDebounce();

    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    const [, params] = searchSpy.mock.calls[0];
    expect((params as URLSearchParams).get('description:contains')).toBe('blood');

    searchSpy.mockRestore();
  });
});
