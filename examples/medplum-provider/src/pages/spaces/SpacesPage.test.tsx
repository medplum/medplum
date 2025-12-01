// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react';
import { MockClient } from '@medplum/mock';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { SpacesPage } from './SpacesPage';
import type { Communication } from '@medplum/fhirtypes';

const mockTopic: Communication = {
  resourceType: 'Communication',
  id: 'topic-123',
  status: 'in-progress',
  identifier: [
    {
      system: 'http://medplum.com/ai-message',
      value: 'ai-message-topic',
    },
  ],
  topic: {
    text: 'Test conversation',
  },
};

const mockProfile = {
  resourceType: 'Practitioner' as const,
  id: 'practitioner-123',
};

describe('SpacesPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();

    Element.prototype.scrollTo = vi.fn();
    medplum.getProfile = vi.fn().mockResolvedValue(mockProfile);
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    medplum.readReference = vi.fn().mockResolvedValue(mockTopic);
  });

  const setup = (initialEntries = ['/Spaces']): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Routes>
              <Route path="/Spaces" element={<SpacesPage />}>
                <Route index element={<SpacesPage />} />
                <Route path="Communication" element={<SpacesPage />} />
                <Route path="Communication/:topicId" element={<SpacesPage />} />
              </Route>
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders SpaceInbox with no topicId when at root', async () => {
    await act(async () => {
      setup(['/Spaces']);
    });

    expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask, search, or make anything...')).toBeInTheDocument();
  });

  test('renders SpaceInbox with topic reference from URL', async () => {
    await act(async () => {
      setup(['/Spaces/Communication/123']);
    });

    await waitFor(() => {
      expect(medplum.readReference).toHaveBeenCalledWith({ reference: 'Communication/123' });
    });
  });

  test('generates correct link for selected item', async () => {
    medplum.searchResources = vi.fn().mockImplementation((resourceType: string, query: any) => {
      if (query?.identifier === 'http://medplum.com/ai-message|ai-message-topic') {
        return Promise.resolve([mockTopic]);
      }
      return Promise.resolve([]);
    });

    await act(async () => {
      setup(['/Spaces']);
    });

    // Sidebar is open by default, so we don't need to click history button
    await waitFor(() => {
      expect(screen.getByText('Test conversation')).toBeInTheDocument();
    });

    const link = screen.getByText('Test conversation').closest('a');
    expect(link).toHaveAttribute('href', '/Spaces/Communication/topic-123');
  });
});
