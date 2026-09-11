// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { formatDate } from '@medplum/core';
import type { Attachment, DocumentReference } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DocumentDetailPanel } from './DocumentDetailPanel';

const PDF_URL = 'http://example.com/binary/summary.pdf';
const PNG_URL = 'http://example.com/binary/scan.png';
const MP4_URL = 'http://example.com/binary/exam.mp4';

function createDocument(overrides: Partial<DocumentReference> = {}): WithId<DocumentReference> {
  return {
    resourceType: 'DocumentReference',
    id: 'doc-1',
    status: 'current',
    subject: { reference: `Patient/${HomerSimpson.id}` },
    content: [{ attachment: { contentType: 'application/pdf', url: PDF_URL, title: 'summary.pdf' } }],
    ...overrides,
  };
}

function withAttachment(
  attachment: Attachment | undefined,
  overrides: Partial<DocumentReference> = {}
): WithId<DocumentReference> {
  return createDocument({ content: attachment ? [{ attachment }] : [], ...overrides });
}

describe('DocumentDetailPanel', () => {
  let medplum: MockClient;
  const onDocumentChange = vi.fn();
  const onDocumentDeleted = vi.fn();

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  // The header actions are icon-only buttons whose label lives in a Mantine Tooltip, which is not
  // an accessible name — so they are addressed by their Tabler icon.
  function iconButton(icon: 'edit-circle' | 'browser-share' | 'printer'): HTMLElement {
    const button = document.querySelector(`.tabler-icon-${icon}`)?.closest('button');
    if (!button) {
      throw new Error(`Expected a ${icon} button`);
    }
    return button;
  }

  function setup(item: WithId<DocumentReference> = createDocument()): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <DocumentDetailPanel
              item={item}
              patientRef={{ reference: `Patient/${HomerSimpson.id}` }}
              onDocumentChange={onDocumentChange}
              onDocumentDeleted={onDocumentDeleted}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  describe('Header', () => {
    test('Names the document by its description', () => {
      setup(createDocument({ description: 'Discharge summary' }));

      expect(screen.getByText('Discharge summary')).toBeInTheDocument();
    });

    test('Falls back to "Untitled Document" when the resource has no display name', () => {
      setup();

      expect(screen.getByText('Untitled Document')).toBeInTheDocument();
    });

    test('Opens the attachment in a new browser tab', () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      setup();

      fireEvent.click(iconButton('browser-share'));

      expect(openSpy).toHaveBeenCalledWith(PDF_URL, '_blank');
    });

    test('Hides the open-in-browser action when the attachment has no url', () => {
      setup(withAttachment({ contentType: 'application/pdf' }));

      expect(document.querySelector('.tabler-icon-browser-share')).not.toBeInTheDocument();
      // Edit and fax remain available even without a downloadable attachment.
      expect(iconButton('edit-circle')).toBeInTheDocument();
      expect(iconButton('printer')).toBeInTheDocument();
    });

    test('Opens the edit details modal', async () => {
      setup();

      expect(screen.queryByText('Edit Document Details')).not.toBeInTheDocument();
      fireEvent.click(iconButton('edit-circle'));

      expect(await screen.findByText('Edit Document Details')).toBeInTheDocument();
    });

    test('Opens the send fax modal seeded with the attachment', async () => {
      setup();

      expect(screen.queryByRole('button', { name: 'Send Fax' })).not.toBeInTheDocument();
      fireEvent.click(iconButton('printer'));

      expect(await screen.findByRole('button', { name: 'Send Fax' })).toBeInTheDocument();
      // The attachment comes from the document, so the modal skips its own file picker.
      expect(screen.queryByText('Drag a file here or click to browse')).not.toBeInTheDocument();
    });
  });

  describe('Preview', () => {
    test('Renders a PDF in an iframe with the pdf viewer panes hidden', () => {
      setup();

      const iframe = screen.getByTitle('Attachment');
      expect(iframe).toHaveAttribute('src', `${PDF_URL}#navpanes=0`);
    });

    test.each(['application/json', 'text/plain'])('Renders %s in the pdf-style iframe', (contentType) => {
      setup(withAttachment({ contentType, url: PDF_URL }));

      expect(screen.getByTitle('Attachment')).toBeInTheDocument();
    });

    test('Renders an image preview titled by the attachment', () => {
      setup(withAttachment({ contentType: 'image/png', url: PNG_URL, title: 'scan.png' }));

      const img = screen.getByAltText('scan.png');
      expect(img).toHaveAttribute('src', PNG_URL);
      expect(screen.queryByTitle('Attachment')).not.toBeInTheDocument();
    });

    test('Falls back to a generic image alt text', () => {
      setup(withAttachment({ contentType: 'image/png', url: PNG_URL }));

      expect(screen.getByAltText('Attachment')).toBeInTheDocument();
    });

    test('Renders a video preview', () => {
      const { container } = setup(withAttachment({ contentType: 'video/mp4', url: MP4_URL }));

      const source = container.querySelector('video source');
      expect(source).toHaveAttribute('src', MP4_URL);
      expect(source).toHaveAttribute('type', 'video/mp4');
    });

    test('Reports no preview when the document has no attachment', () => {
      setup(withAttachment(undefined));

      expect(screen.getByText('No preview available for this document')).toBeInTheDocument();
    });

    test('Reports no preview when the attachment has no url', () => {
      setup(withAttachment({ contentType: 'image/png' }));

      expect(screen.getByText('No preview available for this document')).toBeInTheDocument();
    });

    test('Reports an unsupported file type for a non-previewable attachment', () => {
      setup(withAttachment({ contentType: 'application/zip', url: 'http://example.com/binary/archive.zip' }));

      expect(screen.getByText('No preview available for this file type')).toBeInTheDocument();
    });
  });

  describe('Metadata', () => {
    test('Renders type, category, content type, and author', () => {
      setup(
        createDocument({
          type: { coding: [{ display: 'Discharge summary' }] },
          category: [{ coding: [{ display: 'Clinical Note' }] }, { text: 'Referral' }],
          author: [{ reference: 'Practitioner/dr-nick', display: 'Dr. Nick Riviera' }],
        })
      );

      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Clinical Note, Referral')).toBeInTheDocument();
      expect(screen.getByText('Content type')).toBeInTheDocument();
      expect(screen.getByText('application/pdf')).toBeInTheDocument();
      expect(screen.getByText('Dr. Nick Riviera')).toBeInTheDocument();
    });

    test('Omits type, category, and content type rows when they are absent', () => {
      setup(withAttachment({ url: PDF_URL }));

      expect(screen.queryByText('Type')).not.toBeInTheDocument();
      expect(screen.queryByText('Category')).not.toBeInTheDocument();
      expect(screen.queryByText('Content type')).not.toBeInTheDocument();
    });

    test('Falls back to the author reference when it has no display', () => {
      setup(createDocument({ author: [{ reference: 'Practitioner/dr-nick' }] }));

      expect(screen.getByText('Practitioner/dr-nick')).toBeInTheDocument();
    });

    test('Notes when no author is attributed', () => {
      setup();

      expect(screen.getByText('No author attributed')).toBeInTheDocument();
    });

    test('Attributes the last update to the audit author', () => {
      setup(
        createDocument({
          date: '2026-03-01T10:00:00Z',
          meta: {
            lastUpdated: '2026-03-04T15:30:00Z',
            author: { reference: 'Practitioner/dr-hibbert', display: 'Dr. Hibbert' },
          },
        })
      );

      expect(screen.getByText('Added')).toBeInTheDocument();
      expect(screen.getByText(formatDate('2026-03-01T10:00:00Z'))).toBeInTheDocument();
      expect(screen.getByText('Last updated')).toBeInTheDocument();
      expect(screen.getByText('by Dr. Hibbert')).toBeInTheDocument();
    });

    test('Dates the document from meta.lastUpdated when it has no date', () => {
      setup(createDocument({ meta: { lastUpdated: '2026-03-04T15:30:00Z' } }));

      // Both "Added" and "Last updated" fall back to the same timestamp.
      expect(screen.getAllByText(formatDate('2026-03-04T15:30:00Z'))).toHaveLength(2);
    });

    test('Omits the date rows when the document has no timestamps', () => {
      setup();

      expect(screen.queryByText('Added')).not.toBeInTheDocument();
      expect(screen.queryByText('Last updated')).not.toBeInTheDocument();
    });
  });
});
