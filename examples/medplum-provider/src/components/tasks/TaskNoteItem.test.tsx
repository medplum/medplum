// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, beforeEach } from 'vitest';
import { TaskNoteItem } from './TaskNoteItem';
import type { Annotation, Practitioner } from '@medplum/fhirtypes';

describe('TaskNoteItem', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  const setup = (note: Annotation): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <TaskNoteItem note={note} index={0} />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  test('renders note text', () => {
    const note: Annotation = {
      text: 'Test note content',
      time: '2023-01-01T12:00:00Z',
    };
    setup(note);
    expect(screen.getByText('Test note content')).toBeInTheDocument();
  });

  test('renders author name', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: 'practitioner-123',
      name: [{ given: ['Alice'], family: 'Wonderland' }],
    };
    await medplum.createResource(practitioner);

    const note: Annotation = {
      text: 'Note with author',
      authorReference: { reference: 'Practitioner/practitioner-123' },
      time: '2023-01-01T12:00:00Z',
    };

    setup(note);

    expect(await screen.findByText('Alice Wonderland')).toBeInTheDocument();
  });

  test('renders links in text', () => {
    const note: Annotation = {
      text: 'Check this link: https://example.com',
      time: '2023-01-01T12:00:00Z',
    };
    setup(note);

    const link = screen.getByText('https://example.com');
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://example.com');
  });
});
