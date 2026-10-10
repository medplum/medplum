// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { contentResponse, mockTopic } from '../../test-utils/spaces';
import { SpacesPage } from './SpacesPage';

const mockProfile = {
  resourceType: 'Practitioner' as const,
  id: 'practitioner-123',
};

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe('SpacesPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();

    Element.prototype.scrollTo = vi.fn();
    medplum.getProfile = vi.fn().mockResolvedValue(mockProfile);
    medplum.getProject = vi
      .fn()
      .mockReturnValue({ resourceType: 'Project', id: 'project-123', features: ['bots', 'ai'] });
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    medplum.createResource = vi.fn().mockImplementation((resource: Communication) => {
      if (resource.identifier?.[0]?.value === 'ai-message-topic') {
        return Promise.resolve(mockTopic);
      }
      return Promise.resolve({ ...resource, id: 'message-123' });
    });
    medplum.searchOne = vi.fn().mockResolvedValue({ resourceType: 'Bot', id: 'bot-1' }) as any;
    medplum.executeBot = vi.fn().mockResolvedValue(contentResponse('Bot response'));
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
            <LocationProbe />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('shows disabled message when bots and ai features are not enabled', async () => {
    medplum.getProject = vi.fn().mockReturnValue({ resourceType: 'Project', id: 'project-123', features: [] });

    await act(async () => {
      setup(['/Spaces']);
    });

    expect(screen.getByText('Spaces is not available')).toBeInTheDocument();
    expect(screen.getByText(/requires both/i)).toBeInTheDocument();
  });

  test('shows disabled message when only bots feature is enabled', async () => {
    medplum.getProject = vi.fn().mockReturnValue({ resourceType: 'Project', id: 'project-123', features: ['bots'] });

    await act(async () => {
      setup(['/Spaces']);
    });

    expect(screen.getByText('Spaces is not available')).toBeInTheDocument();
  });

  test('shows disabled message when only ai feature is enabled', async () => {
    medplum.getProject = vi.fn().mockReturnValue({ resourceType: 'Project', id: 'project-123', features: ['ai'] });

    await act(async () => {
      setup(['/Spaces']);
    });

    expect(screen.getByText('Spaces is not available')).toBeInTheDocument();
  });

  test('renders SpaceInbox with no topicId when at root', async () => {
    await act(async () => {
      setup(['/Spaces']);
    });

    expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask, search, or make anything...')).toBeInTheDocument();
  });

  test('loads the conversation named by the URL', async () => {
    await act(async () => {
      setup(['/Spaces/Communication/123']);
    });

    await waitFor(() => {
      expect(medplum.searchResources).toHaveBeenCalledWith(
        'Communication',
        expect.objectContaining({ 'part-of': 'Communication/123' })
      );
    });
  });

  test('navigates to the new topic after the first message without reloading it', async () => {
    const user = userEvent.setup();
    await act(async () => {
      setup(['/Spaces/Communication']);
    });

    await user.type(screen.getByPlaceholderText('Ask, search, or make anything...'), 'Hello AI');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/Spaces/Communication/topic-123'));
    expect(await screen.findByText('Bot response')).toBeInTheDocument();
    expect(screen.getByText('Hello AI')).toBeInTheDocument();
    const messageLoads = vi
      .mocked(medplum.searchResources)
      .mock.calls.filter(([, query]) => (query as Record<string, string>)?.['part-of']);
    expect(messageLoads).toHaveLength(0);
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
