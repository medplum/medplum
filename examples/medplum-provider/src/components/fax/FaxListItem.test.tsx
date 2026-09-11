// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Communication, Organization, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { FaxTab } from './FaxListItem';
import { FaxListItem } from './FaxListItem';

const PATIENT: Patient = {
  resourceType: 'Patient',
  id: 'patient-1',
  name: [{ given: ['Homer'], family: 'Simpson' }],
};

const INBOUND_FAX: Communication = {
  resourceType: 'Communication',
  id: 'fax-1',
  status: 'completed',
  sent: '2026-03-04T15:30:00Z',
  topic: { text: 'Referral packet' },
};

function getFaxUri(fax: Communication): string {
  return `/fax/inbox/${fax.id}`;
}

describe('FaxListItem', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  function setup(
    fax: Communication,
    activeTab: FaxTab = 'inbox',
    selectedFax?: Communication
  ): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <FaxListItem fax={fax} selectedFax={selectedFax} activeTab={activeTab} getFaxUri={getFaxUri} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  describe('Inbox', () => {
    test('Leads with the sender display name', () => {
      setup({ ...INBOUND_FAX, sender: { display: 'Springfield Clinic' } });
      expect(screen.getByText('Springfield Clinic')).toBeInTheDocument();
      expect(screen.getByText('Referral packet')).toBeInTheDocument();
    });

    test('Falls back to the originating fax number, formatted', () => {
      setup({
        ...INBOUND_FAX,
        extension: [{ url: 'https://efax.com/originating-fax-number', valueString: '15551234567' }],
      });
      expect(screen.getByText('+1 (555) 123-4567')).toBeInTheDocument();
    });

    test('Falls back to an unknown sender', () => {
      setup(INBOUND_FAX);
      expect(screen.getByText('Unknown Sender')).toBeInTheDocument();
    });

    test('Labels a fax with no topic', () => {
      setup({ ...INBOUND_FAX, topic: undefined });
      expect(screen.getByText('(No Subject)')).toBeInTheDocument();
    });

    test('Joins the sent date and the assigned patient', async () => {
      await medplum.createResource(PATIENT);
      setup({ ...INBOUND_FAX, subject: { reference: 'Patient/patient-1' } });

      expect(await screen.findByText(/Homer Simpson/)).toHaveTextContent(/·/);
    });

    test('Omits the date line entirely when there is no date or patient', () => {
      setup({ ...INBOUND_FAX, sent: undefined });
      expect(screen.queryByText(/·/)).not.toBeInTheDocument();
    });

    test('Links to the fax and marks the selected one', () => {
      const { container } = setup(INBOUND_FAX, 'inbox', INBOUND_FAX);
      expect(screen.getByRole('link')).toHaveAttribute('href', '/fax/inbox/fax-1');
      expect(container.querySelector('[class*="selected"]')).not.toBeNull();
    });

    test('Leaves an unselected item unmarked', () => {
      const { container } = setup(INBOUND_FAX, 'inbox', { ...INBOUND_FAX, id: 'other-fax' });
      expect(container.querySelector('[class*="selected"]')).toBeNull();
    });
  });

  describe('Sent', () => {
    test('Shows the fax number of an ad hoc "Fax Recipient" organization', async () => {
      // Outbound faxes to a bare number create a placeholder Organization, whose name would be
      // meaningless in the list — the number it was sent to is what identifies it.
      await medplum.createResource<Organization>({
        resourceType: 'Organization',
        id: 'org-adhoc',
        name: 'Fax Recipient',
        contact: [{ telecom: [{ system: 'fax', value: '5559876543' }] }],
      });
      setup({ ...INBOUND_FAX, recipient: [{ reference: 'Organization/org-adhoc', display: 'Fax Recipient' }] }, 'sent');

      expect(await screen.findByText('+1 (555) 987-6543')).toBeInTheDocument();
    });

    test('Falls back to the reference display when the placeholder has no fax number', async () => {
      await medplum.createResource<Organization>({
        resourceType: 'Organization',
        id: 'org-no-fax',
        name: 'Fax Recipient',
      });
      setup(
        { ...INBOUND_FAX, recipient: [{ reference: 'Organization/org-no-fax', display: 'Fax Recipient' }] },
        'sent'
      );

      expect(await screen.findByText('Fax Recipient')).toBeInTheDocument();
    });

    test('Names a real organization rather than its number', async () => {
      await medplum.createResource<Organization>({
        resourceType: 'Organization',
        id: 'org-clinic',
        name: 'Shelbyville Clinic',
        telecom: [{ system: 'fax', value: '5551112222' }],
      });
      setup(
        { ...INBOUND_FAX, recipient: [{ reference: 'Organization/org-clinic', display: 'Shelbyville Clinic' }] },
        'sent'
      );

      expect(await screen.findByText('Shelbyville Clinic')).toBeInTheDocument();
    });

    test('Formats a recipient display that is just a number', () => {
      setup({ ...INBOUND_FAX, recipient: [{ display: '555 123 4567' }] }, 'sent');
      expect(screen.getByText('+1 (555) 123-4567')).toBeInTheDocument();
    });

    test('Leaves a display that does not start with a digit alone', () => {
      setup({ ...INBOUND_FAX, recipient: [{ display: '(555) 123-4567 ext 2' }] }, 'sent');
      expect(screen.getByText('(555) 123-4567 ext 2')).toBeInTheDocument();
    });

    test('Falls back to an unknown recipient', () => {
      setup({ ...INBOUND_FAX, recipient: [{ reference: 'Organization/gone' }] }, 'sent');
      expect(screen.getByText('Unknown recipient')).toBeInTheDocument();
    });

    test('Reports no recipient at all', () => {
      setup({ ...INBOUND_FAX, recipient: [] }, 'sent');
      expect(screen.getByText('Unknown recipient')).toBeInTheDocument();
    });
  });
});
