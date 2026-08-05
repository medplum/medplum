// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Bundle, Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { FaxPage } from './FaxPage';

vi.mock('@medplum/react-hooks', async () => {
  const actual = await vi.importActual('@medplum/react-hooks');
  return {
    ...actual,
    useSubscription: vi.fn(),
  };
});

const INBOX_FAX: WithId<Communication> = {
  resourceType: 'Communication',
  id: 'fax-inbox-001',
  status: 'in-progress',
  medium: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
          code: 'FAXWRIT',
        },
      ],
    },
  ],
  category: [
    {
      coding: [
        {
          system: 'http://medplum.com/fhir/CodeSystem/fax-direction',
          code: 'inbound',
        },
      ],
    },
  ],
  sent: '2024-06-01T10:00:00Z',
  topic: { text: 'Referral for patient' },
  sender: { display: '5551234567', reference: 'Organization/external-org' },
};

function bundleOf(...comms: WithId<Communication>[]): Bundle<WithId<Communication>> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: comms.length,
    entry: comms.map((resource) => ({ resource })),
  };
}

describe('FaxPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (initialPath = '/Fax/Communication'): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Fax/Communication" element={<FaxPage />} />
              <Route path="/Fax/Communication/new" element={<FaxPage />} />
              <Route path="/Fax/Communication/:faxId" element={<FaxPage />} />
              <Route path="/Fax/Communication/:faxId/new" element={<FaxPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders inbox tab by default', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf());
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Received' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Sent' })).toBeInTheDocument();
    });
  });

  test('shows empty state when no faxes in inbox', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf());
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup();

    await waitFor(() => {
      expect(screen.getByText('No faxes in your inbox.')).toBeInTheDocument();
    });
  });

  test('shows loading skeleton initially', async () => {
    medplum.search = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup();

    await waitFor(() => {
      const skeletons = document.querySelectorAll('.mantine-Skeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  test('renders fax list items when faxes are returned', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf(INBOX_FAX));
    vi.spyOn(medplum, 'post').mockResolvedValue({});
    vi.spyOn(medplum, 'readResource').mockResolvedValue(INBOX_FAX);

    setup(`/Fax/Communication/${INBOX_FAX.id}`);

    await waitFor(() => {
      expect(screen.getByText('Referral for patient')).toBeInTheDocument();
    });
  });

  test('shows empty state for sent tab', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf());
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup('/Fax/Communication?category=outbound');

    await waitFor(() => {
      expect(screen.getByText('No sent faxes.')).toBeInTheDocument();
    });
  });

  test('renders send fax action icon', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf());
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup();

    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      const sendButton = buttons.find((btn) => btn.querySelector('.tabler-icon-send'));
      expect(sendButton).toBeInTheDocument();
    });
  });

  test('opens send fax modal when URL is /Fax/Communication/new', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf());
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup('/Fax/Communication/new');

    await waitFor(() => {
      expect(screen.getAllByText('Send Fax').length).toBeGreaterThan(0);
    });
  });

  test('opens send fax modal over a fax when URL is /Fax/Communication/:faxId/new', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf(INBOX_FAX));
    vi.spyOn(medplum, 'post').mockResolvedValue({});
    vi.spyOn(medplum, 'readResource').mockResolvedValue(INBOX_FAX);

    setup(`/Fax/Communication/${INBOX_FAX.id}/new`);

    await waitFor(() => {
      expect(screen.getByText('Referral for patient')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getAllByText('Send Fax').length).toBeGreaterThan(0);
    });
  });

  test('does not open send fax modal on the list view', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf());
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup();

    await waitFor(() => {
      expect(screen.getByText('No faxes in your inbox.')).toBeInTheDocument();
    });

    expect(screen.queryByText('Send Fax')).not.toBeInTheDocument();
  });

  test('clicking send fax button opens the modal via /new and closing returns to the list', async () => {
    const user = userEvent.setup();
    medplum.search = vi.fn().mockResolvedValue(bundleOf());
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup();

    await waitFor(() => {
      expect(screen.getByText('No faxes in your inbox.')).toBeInTheDocument();
    });

    const sendButton = screen.getAllByRole('button').find((btn) => btn.querySelector('.tabler-icon-send'));
    expect(sendButton).toBeDefined();
    await user.click(sendButton as HTMLElement);

    await waitFor(() => {
      expect(screen.getAllByText('Send Fax').length).toBeGreaterThan(0);
    });

    const closeButton = document.querySelector('.mantine-Modal-close');
    expect(closeButton).not.toBeNull();
    await user.click(closeButton as Element);

    await waitFor(() => {
      expect(screen.queryByText('Send Fax')).not.toBeInTheDocument();
    });
  });

  test('shows no fax selected empty state when faxId not in list', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf());
    vi.spyOn(medplum, 'post').mockResolvedValue({});
    vi.spyOn(medplum, 'readResource').mockRejectedValue(new Error('Not found'));

    setup('/Fax/Communication/nonexistent-id');

    await waitFor(() => {
      expect(screen.getByText('No fax selected')).toBeInTheDocument();
    });
  });
});
