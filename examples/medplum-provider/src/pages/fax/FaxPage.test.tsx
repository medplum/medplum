// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
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
              <Route path="/Fax/Communication/:faxId" element={<FaxPage />} />
              <Route path="/Fax/Communication" element={<FaxPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders inbox tab by default', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Received' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Sent' })).toBeInTheDocument();
    });
  });

  test('shows empty state when no faxes in inbox', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup();

    await waitFor(() => {
      expect(screen.getByText('No faxes in your inbox.')).toBeInTheDocument();
    });
  });

  test('shows loading skeleton initially', async () => {
    medplum.searchResources = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup();

    await waitFor(() => {
      const skeletons = document.querySelectorAll('.mantine-Skeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  test('renders fax list items when faxes are returned', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([INBOX_FAX]);
    vi.spyOn(medplum, 'post').mockResolvedValue({});
    vi.spyOn(medplum, 'readResource').mockResolvedValue(INBOX_FAX);

    setup(`/Fax/Communication/${INBOX_FAX.id}`);

    await waitFor(() => {
      expect(screen.getByText('Referral for patient')).toBeInTheDocument();
    });
  });

  test('shows empty state for sent tab', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup('/Fax/Communication?category=outbound');

    await waitFor(() => {
      expect(screen.getByText('No sent faxes.')).toBeInTheDocument();
    });
  });

  test('renders send fax action icon', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    vi.spyOn(medplum, 'post').mockResolvedValue({});

    setup();

    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      const sendButton = buttons.find((btn) => btn.querySelector('.tabler-icon-send'));
      expect(sendButton).toBeInTheDocument();
    });
  });

  test('shows no fax selected empty state when faxId not in list', async () => {
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    vi.spyOn(medplum, 'post').mockResolvedValue({});
    vi.spyOn(medplum, 'readResource').mockRejectedValue(new Error('Not found'));

    setup('/Fax/Communication/nonexistent-id');

    await waitFor(() => {
      expect(screen.getByText('No fax selected')).toBeInTheDocument();
    });
  });
});
