// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { allOk, notFound, OperationOutcomeError } from '@medplum/core';
import type { Attachment, Communication, Organization, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SendFaxModalProps } from './SendFaxModal';
import { SendFaxModal } from './SendFaxModal';

const PDF_ATTACHMENT: Attachment = {
  contentType: 'application/pdf',
  url: 'http://example.com/binary/existing-fax.pdf',
  title: 'referral.pdf',
};

const RECIPIENT_ORG: Organization = {
  resourceType: 'Organization',
  id: 'org-clinic',
  name: 'Shelbyville Clinic',
  telecom: [{ system: 'fax', value: '5559876543' }],
};

const ORG_WITHOUT_FAX: Organization = {
  resourceType: 'Organization',
  id: 'org-no-fax',
  name: 'Ogdenville Medical',
};

describe('SendFaxModal', () => {
  let medplum: MockClient;
  let onClose: () => void;
  let onFaxSent: (fax: Communication) => void;

  beforeEach(() => {
    medplum = new MockClient();
    onClose = vi.fn();
    onFaxSent = vi.fn();
    vi.clearAllMocks();
    // The notification store is global and its display limit is shared, so leftovers from an
    // earlier test would queue this test's notification instead of rendering it.
    notifications.clean();
    notifications.cleanQueue();
  });

  function setup(props: Partial<SendFaxModalProps> = {}): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <SendFaxModal opened onClose={onClose} onFaxSent={onFaxSent} {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  // Stubs only the `$send-efax` operation, leaving every other `post` — which is how the client
  // creates the DocumentReference, Organization, and Communication — running against MockClient.
  function mockSendEfax(result: Error | 'ok'): ReturnType<typeof vi.spyOn> {
    const post = medplum.post.bind(medplum);
    return vi.spyOn(medplum, 'post').mockImplementation(async (url, ...rest) => {
      if (String(url).includes('$send-efax')) {
        if (result instanceof Error) {
          throw result;
        }
        return allOk;
      }
      return post(url, ...(rest as []));
    }) as ReturnType<typeof vi.spyOn>;
  }

  // Attaches a file to the hidden file input, which a click-to-browse cannot reach in jsdom.
  function attachFile(name = 'referral.pdf', type = 'application/pdf'): File {
    const file = new File(['%PDF-1.7'], name, { type });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    return file;
  }

  async function typeFaxNumber(value: string): Promise<void> {
    await userEvent.type(screen.getByLabelText(/Fax Number/), value);
  }

  test('Renders nothing while closed', () => {
    setup({ opened: false });
    expect(screen.queryByText('Send Fax')).not.toBeInTheDocument();
  });

  describe('Validation', () => {
    test('Requires a fax number', async () => {
      setup();
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));
      expect(await screen.findByText('A fax number is required.')).toBeInTheDocument();
    });

    test('Requires at least 10 digits', async () => {
      setup();
      await typeFaxNumber('555-1234');
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));
      expect(await screen.findByText('Fax number must have at least 10 digits')).toBeInTheDocument();
    });

    test('Requires a document', async () => {
      setup();
      await typeFaxNumber('5551234567');
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));
      expect(await screen.findByText('Please select a file to fax')).toBeInTheDocument();
    });

    test('Requires a practitioner profile', async () => {
      // A patient- or bot-scoped login has no practitioner to record as the sender.
      vi.spyOn(medplum, 'getProfile').mockReturnValue({ resourceType: 'Patient', id: 'patient-1' } as never);
      setup();
      attachFile();
      await typeFaxNumber('5551234567');
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));

      expect(await screen.findByText('Invalid practitioner profile')).toBeInTheDocument();
    });
  });

  describe('Recipient organization', () => {
    test('Fills in the fax number from the selected organization', async () => {
      await medplum.createResource(RECIPIENT_ORG);
      setup();

      await userEvent.type(screen.getByPlaceholderText('Search for an organization...'), 'Shelbyville');
      await userEvent.click(await screen.findByText('Shelbyville Clinic'));

      await waitFor(() => expect(screen.getByLabelText(/Fax Number/)).toHaveValue('5559876543'));
    });

    test('Reads the fax number from an organization contact', async () => {
      await medplum.createResource<Organization>({
        ...ORG_WITHOUT_FAX,
        id: 'org-contact-fax',
        name: 'Capital City Radiology',
        contact: [{ telecom: [{ system: 'fax', value: '5552223333' }] }],
      });
      setup();

      await userEvent.type(screen.getByPlaceholderText('Search for an organization...'), 'Capital City');
      await userEvent.click(await screen.findByText('Capital City Radiology'));

      await waitFor(() => expect(screen.getByLabelText(/Fax Number/)).toHaveValue('5552223333'));
    });

    test('Warns when the selected organization has no fax number', async () => {
      await medplum.createResource(ORG_WITHOUT_FAX);
      setup();

      await userEvent.type(screen.getByPlaceholderText('Search for an organization...'), 'Ogdenville');
      await userEvent.click(await screen.findByText('Ogdenville Medical'));

      expect(await screen.findByText('No fax number')).toBeInTheDocument();
      // Sending now blames the organization rather than the empty field.
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));
      expect(await screen.findByText('Validation Error')).toBeInTheDocument();
      expect(await screen.findAllByText('Selected organization has no fax number. Please enter one.')).toHaveLength(2);
    });
  });

  describe('Sending', () => {
    test('Uploads the file, records it in the chart, and sends the fax', async () => {
      const createAttachment = vi.spyOn(medplum, 'createAttachment').mockResolvedValue(PDF_ATTACHMENT);
      const post = mockSendEfax('ok');
      setup();

      const file = attachFile();
      await userEvent.type(screen.getByLabelText('Subject (optional)'), 'Referral packet');
      await userEvent.type(screen.getByLabelText('Cover Page Note (optional)'), 'Please review.');
      await userEvent.type(screen.getByLabelText('Recipient Name (optional)'), 'Dr. Hibbert');
      await typeFaxNumber('+1 (555) 123-4567');
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));

      expect(await screen.findByText('Fax sent successfully')).toBeInTheDocument();
      expect(createAttachment).toHaveBeenCalledWith({
        data: file,
        contentType: 'application/pdf',
        filename: 'referral.pdf',
      });

      // The document is filed as a DocumentReference and the Communication points at it, so the
      // fax shows up in the patient's documents rather than only on the Communication.
      const documentReference = await medplum.searchOne('DocumentReference', 'description=Referral packet');
      expect(documentReference?.content?.[0].attachment.url).toBe(PDF_ATTACHMENT.url);

      const sent = vi.mocked(onFaxSent).mock.calls[0][0];
      expect(sent.category?.[0].coding?.[0].code).toBe('outbound');
      expect(sent.payload?.[0].contentReference?.reference).toBe(`DocumentReference/${documentReference?.id}`);
      expect(sent.topic?.text).toBe('Referral packet');
      expect(sent.note?.map((n) => n.text)).toEqual(['Attn: Dr. Hibbert', 'Please review.']);

      // An ad hoc recipient Organization carries the digits that were dialed, punctuation stripped.
      const recipient = await medplum.readReference(sent.recipient?.[0] as never);
      expect((recipient as Organization).contact?.[0].telecom?.[0].value).toBe('15551234567');
      expect((recipient as Organization).name).toBe('Dr. Hibbert');

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: expect.stringContaining('$send-efax') }),
        expect.objectContaining({ resourceType: 'Communication' })
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('Names an ad hoc recipient organization "Fax Recipient" when unnamed', async () => {
      vi.spyOn(medplum, 'createAttachment').mockResolvedValue(PDF_ATTACHMENT);
      mockSendEfax('ok');
      setup();

      attachFile();
      await typeFaxNumber('5551234567');
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));

      await screen.findByText('Fax sent successfully');
      const sent = vi.mocked(onFaxSent).mock.calls[0][0];
      const recipient = (await medplum.readReference(sent.recipient?.[0] as never)) as Organization;
      expect(recipient.name).toBe('Fax Recipient');
      expect(sent.note).toBeUndefined();
      expect(sent.topic).toBeUndefined();
    });

    test('Links the patient chosen in the modal', async () => {
      await medplum.createResource<Patient>({
        resourceType: 'Patient',
        id: 'patient-1',
        name: [{ given: ['Bartholomew'], family: 'Faxman' }],
      });
      vi.spyOn(medplum, 'createAttachment').mockResolvedValue(PDF_ATTACHMENT);
      mockSendEfax('ok');
      setup();

      attachFile();
      await userEvent.type(screen.getByPlaceholderText('Link to a patient...'), 'Faxman');
      await userEvent.click(await screen.findByText('Bartholomew Faxman'));
      await typeFaxNumber('5551234567');
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));

      await screen.findByText('Fax sent successfully');
      const sent = vi.mocked(onFaxSent).mock.calls[0][0];
      expect(sent.subject?.reference).toBe('Patient/patient-1');
      // The stored document is filed under the same patient.
      const documentReference = await medplum.searchOne('DocumentReference', 'subject=Patient/patient-1');
      expect(documentReference).toBeDefined();
    });

    test('Sends to the selected organization instead of creating one', async () => {
      await medplum.createResource(RECIPIENT_ORG);
      vi.spyOn(medplum, 'createAttachment').mockResolvedValue(PDF_ATTACHMENT);
      mockSendEfax('ok');
      setup();

      attachFile();
      await userEvent.type(screen.getByPlaceholderText('Search for an organization...'), 'Shelbyville');
      await userEvent.click(await screen.findByText('Shelbyville Clinic'));
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));

      await screen.findByText('Fax sent successfully');
      const sent = vi.mocked(onFaxSent).mock.calls[0][0];
      expect(sent.recipient?.[0].reference).toBe('Organization/org-clinic');
    });

    test('Forwards an existing attachment without re-uploading it', async () => {
      const createAttachment = vi.spyOn(medplum, 'createAttachment');
      mockSendEfax('ok');
      setup({ defaultAttachment: PDF_ATTACHMENT, defaultPatient: { reference: 'Patient/patient-1' } });

      // Forwarding has nothing to upload, so the file picker is not offered.
      expect(screen.queryByText('Drag a file here or click to browse')).not.toBeInTheDocument();
      await typeFaxNumber('5551234567');
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));

      await screen.findByText('Fax sent successfully');
      expect(createAttachment).not.toHaveBeenCalled();
      const sent = vi.mocked(onFaxSent).mock.calls[0][0];
      expect(sent.payload?.[0].contentAttachment).toEqual(PDF_ATTACHMENT);
      expect(sent.subject?.reference).toBe('Patient/patient-1');
    });

    test('Explains that eFax is not configured', async () => {
      vi.spyOn(medplum, 'createAttachment').mockResolvedValue(PDF_ATTACHMENT);
      mockSendEfax(new OperationOutcomeError(notFound));
      setup();

      attachFile();
      await typeFaxNumber('5551234567');
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));

      expect(await screen.findByText('eFax integration not set up. Contact Medplum Support.')).toBeInTheDocument();
      expect(onFaxSent).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    test('Surfaces any other send failure', async () => {
      vi.spyOn(medplum, 'createAttachment').mockResolvedValue(PDF_ATTACHMENT);
      mockSendEfax(new Error('eFax vendor rejected the fax'));
      setup();

      attachFile();
      await typeFaxNumber('5551234567');
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));

      expect(await screen.findByText('eFax vendor rejected the fax')).toBeInTheDocument();
      expect(onFaxSent).not.toHaveBeenCalled();
    });

    test('Surfaces a failed upload', async () => {
      vi.spyOn(medplum, 'createAttachment').mockRejectedValue(new Error('Upload failed'));
      setup();

      attachFile();
      await typeFaxNumber('5551234567');
      await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));

      expect(await screen.findByText('Upload failed')).toBeInTheDocument();
    });
  });

  describe('File picker', () => {
    test('Shows the chosen file name', () => {
      setup();
      expect(screen.getByText('Drag a file here or click to browse')).toBeInTheDocument();
      expect(screen.getByText('PDF, PNG, JPG, TIFF')).toBeInTheDocument();

      attachFile('scan.png', 'image/png');

      expect(screen.getByText('scan.png')).toBeInTheDocument();
      expect(screen.queryByText('PDF, PNG, JPG, TIFF')).not.toBeInTheDocument();
    });

    test('Clears the file when the picker is dismissed with nothing', () => {
      setup();
      attachFile('scan.png', 'image/png');

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [] } });

      expect(screen.getByText('Drag a file here or click to browse')).toBeInTheDocument();
    });

    test('Opens the picker when the drop zone is clicked', async () => {
      setup();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const click = vi.spyOn(input, 'click');

      await userEvent.click(screen.getByText('Drag a file here or click to browse'));

      expect(click).toHaveBeenCalledTimes(1);
    });

    test('Accepts a dropped file', () => {
      setup();
      const dropZone = screen.getByText('Drag a file here or click to browse').closest('div') as HTMLElement;
      const file = new File(['%PDF-1.7'], 'dropped.pdf', { type: 'application/pdf' });

      fireEvent.dragOver(dropZone);
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

      expect(screen.getByText('dropped.pdf')).toBeInTheDocument();
    });

    test('Ignores a drop with no file and resets the drag highlight', () => {
      setup();
      const dropZone = screen.getByText('Drag a file here or click to browse').closest('div') as HTMLElement;

      fireEvent.dragOver(dropZone);
      fireEvent.dragLeave(dropZone);
      fireEvent.drop(dropZone, { dataTransfer: { files: [] } });

      expect(screen.getByText('Drag a file here or click to browse')).toBeInTheDocument();
    });
  });

  test('Discards what was entered when closed', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Subject (optional)'), 'Referral packet');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
