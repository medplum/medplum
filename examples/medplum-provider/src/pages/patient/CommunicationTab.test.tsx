// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Communication } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import * as reactRouter from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { CommunicationTab } from './CommunicationTab';

vi.mock('@medplum/react-hooks', async () => {
  const actual = await vi.importActual('@medplum/react-hooks');
  return {
    ...actual,
    useSubscription: vi.fn(),
  };
});

describe('CommunicationTab', () => {
  let medplum: MockClient;
  let useNavigateSpy: ReturnType<typeof vi.spyOn>;
  let useParamsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    useNavigateSpy = vi.spyOn(reactRouter, 'useNavigate');
    useParamsSpy = vi.spyOn(reactRouter, 'useParams');
  });

  const setup = (url: string): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/Communication/:messageId?" element={<CommunicationTab />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders ThreadInbox component', async () => {
    setup(`/Patient/${HomerSimpson.id}/Communication`);

    await waitFor(() => {
      expect(screen.getByText('In progress')).toBeInTheDocument();
    });

    expect(useParamsSpy).toHaveBeenCalled();
    expect(useNavigateSpy).toHaveBeenCalled();
  });

  test('Renders ThreadInbox with patient query', async () => {
    setup(`/Patient/${HomerSimpson.id}/Communication`);

    await waitFor(() => {
      expect(screen.getByText('In progress')).toBeInTheDocument();
    });
  });

  test('Attempts to load thread when messageId is in URL', async () => {
    const mockCommunication: Communication = {
      resourceType: 'Communication',
      id: 'message-123',
      status: 'in-progress',
      subject: { reference: `Patient/${HomerSimpson.id}` },
    };

    await medplum.createResource(mockCommunication);

    setup(`/Patient/${HomerSimpson.id}/Communication/message-123`);

    await waitFor(() => {
      expect(screen.getByText('In progress')).toBeInTheDocument();
    });
  });
});
