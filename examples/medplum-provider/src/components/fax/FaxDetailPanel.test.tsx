// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { Communication, DocumentReference, Organization, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { FaxDetailPanel } from './FaxDetailPanel';

const PATIENT: Patient = {
  resourceType: 'Patient',
  id: 'patient-1',
  name: [{ given: ['Bartholomew'], family: 'Faxman' }],
};

const PDF_URL = 'http://example.com/binary/fax.pdf';
const PNG_URL = 'http://example.com/binary/fax.png';

const INBOUND_FAX: Communication = {
  resourceType: 'Communication',
  id: 'fax-1',
  status: 'completed',
  sent: '2026-03-04T15:30:00Z',
  extension: [{ url: 'https://efax.com/originating-fax-number', valueString: '15551234567' }],
  payload: [{ contentAttachment: { contentType: 'application/pdf', url: PDF_URL, title: 'referral.pdf' } }],
};

describe('FaxDetailPanel', () => {
  let medplum: MockClient;
  let onFaxChange: () => void;

  beforeEach(async () => {
    medplum = new MockClient();
    await medplum.createResource(PATIENT);
    onFaxChange = vi.fn();
    vi.clearAllMocks();
    notifications.clean();
    notifications.cleanQueue();
  });

  // The header actions are icon-only buttons whose label lives in a Mantine Tooltip, which is not
  // an accessible name — so they are addressed by their Tabler icon.
  function iconButton(icon: 'download' | 'user-plus' | 'send'): HTMLElement {
    const button = document.querySelector(`.tabler-icon-${icon}`)?.closest('button');
    if (!button) {
      throw new Error(`Expected a ${icon} button`);
    }
    return button;
  }

  function setup(fax: Communication): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <FaxDetailPanel fax={fax} onFaxChange={onFaxChange} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  describe('Header', () => {
    test('Names an inbound fax by its originating number', () => {
      setup(INBOUND_FAX);
      // Once as the panel heading, once in the Sender metadata row.
      expect(screen.getAllByText('+1 (555) 123-4567')).toHaveLength(2);
      expect(screen.getByText('Inbound')).toBeInTheDocument();
    });

    test('Prefers the sender display over the originating number', () => {
      setup({ ...INBOUND_FAX, sender: { display: 'Springfield Clinic' } });
      expect(screen.getByText('Springfield Clinic')).toBeInTheDocument();
    });

    test('Falls back to an unknown sender', () => {
      setup({ ...INBOUND_FAX, extension: undefined });
      expect(screen.getByText('Unknown Sender')).toBeInTheDocument();
    });

    test('Names an outbound fax by its recipient', () => {
      setup({
        ...INBOUND_FAX,
        category: [{ coding: [{ code: 'outbound' }] }],
        recipient: [{ display: '5559876543' }],
      });
      expect(screen.getByText('+1 (555) 987-6543')).toBeInTheDocument();
      expect(screen.getByText('Outbound')).toBeInTheDocument();
    });

    test('Falls back to an unknown recipient on an outbound fax', () => {
      setup({ ...INBOUND_FAX, category: [{ coding: [{ code: 'outbound' }] }] });
      expect(screen.getByText('Unknown recipient')).toBeInTheDocument();
    });
  });

  describe('Attachment', () => {
    test('Frames a PDF in an iframe and offers a download', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      setup(INBOUND_FAX);

      expect(screen.getByTitle('Fax attachment')).toHaveAttribute('src', `${PDF_URL}#navpanes=0`);
      await userEvent.click(iconButton('download'));
      expect(open).toHaveBeenCalledWith(PDF_URL, '_blank', 'noopener,noreferrer');
    });

    test('Renders an image inline instead of an iframe', () => {
      setup({
        ...INBOUND_FAX,
        payload: [{ contentAttachment: { contentType: 'image/png', url: PNG_URL, title: 'scan.png' } }],
      });

      expect(screen.getByAltText('scan.png')).toHaveAttribute('src', PNG_URL);
      expect(screen.queryByTitle('Fax attachment')).not.toBeInTheDocument();
    });

    test('Labels an untitled image', () => {
      setup({ ...INBOUND_FAX, payload: [{ contentAttachment: { contentType: 'image/png', url: PNG_URL } }] });
      expect(screen.getByAltText('Fax attachment')).toBeInTheDocument();
    });

    test('Resolves an attachment carried by a DocumentReference', async () => {
      await medplum.createResource<DocumentReference>({
        resourceType: 'DocumentReference',
        id: 'doc-1',
        status: 'current',
        content: [{ attachment: { contentType: 'application/pdf', url: PDF_URL } }],
      });
      setup({ ...INBOUND_FAX, payload: [{ contentReference: { reference: 'DocumentReference/doc-1' } }] });

      expect(await screen.findByTitle('Fax attachment')).toHaveAttribute('src', `${PDF_URL}#navpanes=0`);
    });

    test('Says so when there is no document', () => {
      setup({ ...INBOUND_FAX, payload: undefined });
      expect(screen.getByText('No document attached to this fax')).toBeInTheDocument();
      expect(document.querySelector('.tabler-icon-download')).toBeNull();
    });

    test('Refuses to render an attachment url that is not a url', () => {
      // A relative `Binary/xyz` url cannot be framed, so the panel reports no viewable document
      // rather than pointing an iframe at a broken src.
      setup({
        ...INBOUND_FAX,
        payload: [{ contentAttachment: { contentType: 'application/pdf', url: 'Binary/xyz' } }],
      });

      expect(screen.getByText('No document attached to this fax')).toBeInTheDocument();
      // The attachment still exists, so the download action stays available.
      expect(iconButton('download')).toBeInTheDocument();
    });

    test('Does nothing when downloading an unusable url', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      setup({
        ...INBOUND_FAX,
        payload: [{ contentAttachment: { contentType: 'application/pdf', url: 'Binary/xyz' } }],
      });

      await userEvent.click(iconButton('download'));
      expect(open).not.toHaveBeenCalled();
    });
  });

  describe('Metadata', () => {
    test('Reports when an inbound fax was received', () => {
      setup(INBOUND_FAX);
      expect(screen.getByText('Received')).toBeInTheDocument();
      expect(screen.getByText('Sender')).toBeInTheDocument();
      expect(screen.getByText('Unassigned')).toBeInTheDocument();
    });

    test('Reports when an outbound fax was sent', () => {
      setup({ ...INBOUND_FAX, category: [{ coding: [{ code: 'outbound' }] }] });
      expect(screen.getByText('Sent')).toBeInTheDocument();
    });

    test('Omits the timestamp row for a fax that was never sent', () => {
      setup({ ...INBOUND_FAX, sent: undefined });
      expect(screen.queryByText('Received')).not.toBeInTheDocument();
    });

    test('Links the assigned patient to their documents', async () => {
      setup({ ...INBOUND_FAX, subject: { reference: 'Patient/patient-1' } });

      const link = await screen.findByRole('link', { name: 'Bartholomew Faxman' });
      expect(link).toHaveAttribute('href', '/Patient/patient-1/DocumentReference');
    });

    test('Details a named recipient organization with its fax number and attention line', async () => {
      await medplum.createResource<Organization>({
        resourceType: 'Organization',
        id: 'org-clinic',
        name: 'Shelbyville Clinic',
        telecom: [{ system: 'fax', value: '5559876543' }],
      });
      setup({
        ...INBOUND_FAX,
        category: [{ coding: [{ code: 'outbound' }] }],
        recipient: [{ reference: 'Organization/org-clinic' }],
        note: [{ text: 'Attn: Dr. Hibbert' }, { text: 'Please review before Friday.' }],
      });

      expect(await screen.findByText('Recipient')).toBeInTheDocument();
      expect(screen.getByText('+1 (555) 987-6543')).toBeInTheDocument();
      expect(screen.getByText('Shelbyville Clinic')).toBeInTheDocument();
      expect(screen.getByText('Attn: Dr. Hibbert')).toBeInTheDocument();
      expect(screen.getByText('Cover Page Note')).toBeInTheDocument();
      expect(screen.getByText('Please review before Friday.')).toBeInTheDocument();
    });

    test('Hides the placeholder name of an ad hoc recipient organization', async () => {
      await medplum.createResource<Organization>({
        resourceType: 'Organization',
        id: 'org-adhoc',
        name: 'Fax Recipient',
        contact: [{ telecom: [{ system: 'fax', value: '5559876543' }] }],
      });
      setup({
        ...INBOUND_FAX,
        category: [{ coding: [{ code: 'outbound' }] }],
        recipient: [{ reference: 'Organization/org-adhoc' }],
      });

      expect(await screen.findByText('+1 (555) 987-6543')).toBeInTheDocument();
      expect(screen.queryByText('Fax Recipient')).not.toBeInTheDocument();
    });

    test('Omits the recipient row when there is nothing to show', () => {
      setup(INBOUND_FAX);
      expect(screen.queryByText('Recipient')).not.toBeInTheDocument();
      expect(screen.queryByText('Cover Page Note')).not.toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    test('Opens and closes the assign patient modal', async () => {
      setup(INBOUND_FAX);
      await userEvent.click(iconButton('user-plus'));
      expect(await screen.findByText('Select Patient')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByText('Select Patient')).not.toBeInTheDocument());
    });

    test('Pre-selects the already assigned patient when reassigning', async () => {
      setup({ ...INBOUND_FAX, subject: { reference: 'Patient/patient-1' } });

      await userEvent.click(iconButton('user-plus'));
      expect(await screen.findByRole('button', { name: 'Remove Assigned Patient' })).toBeInTheDocument();
    });

    test('Opens and closes the forward modal, with the fax already attached', async () => {
      setup(INBOUND_FAX);
      await userEvent.click(iconButton('send'));

      expect(await screen.findByLabelText(/Fax Number/)).toBeInTheDocument();
      // Forwarding reuses the existing document, so no file picker is offered.
      expect(screen.queryByText('Drag a file here or click to browse')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByLabelText(/Fax Number/)).not.toBeInTheDocument());
    });
  });
});
