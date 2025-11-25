// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, render, screen } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react';
import { MockClient } from '@medplum/mock';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SpacesPage } from './SpacesPage';
import type { Communication } from '@medplum/fhirtypes';

// Mock SpaceInbox component
vi.mock('../../components/spaces/SpaceInbox', () => ({
  SpaceInbox: vi.fn(({ topicId, onNewTopic, onSelectedItem }) => (
    <div data-testid="space-inbox">
      <span data-testid="topic-id">{topicId || 'none'}</span>
      <button
        data-testid="new-topic-btn"
        onClick={() => onNewTopic({ resourceType: 'Communication', id: 'new-topic' } as Communication)}
      >
        New Topic
      </button>
      <span data-testid="selected-item-link">
        {onSelectedItem({ resourceType: 'Communication', id: 'selected-topic' } as Communication)}
      </span>
    </div>
  )),
}));

describe('SpacesPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (initialEntries = ['/Spaces']): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Routes>
              <Route path="/Spaces" element={<SpacesPage />}>
                <Route index element={<SpacesPage />} />
                <Route path="Communication/:topicId" element={<SpacesPage />} />
              </Route>
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  it('renders SpaceInbox with no topicId when at root', async () => {
    await act(async () => {
      setup(['/Spaces']);
    });

    expect(screen.getByTestId('space-inbox')).toBeInTheDocument();
    expect(screen.getByTestId('topic-id')).toHaveTextContent('none');
  });

  it('renders SpaceInbox with topicId from URL', async () => {
    await act(async () => {
      setup(['/Spaces/Communication/123']);
    });

    expect(screen.getByTestId('space-inbox')).toBeInTheDocument();
    expect(screen.getByTestId('topic-id')).toHaveTextContent('123');
  });

  it('generates correct link for selected item', async () => {
    await act(async () => {
      setup(['/Spaces']);
    });

    expect(screen.getByTestId('selected-item-link')).toHaveTextContent('/Spaces/Communication/selected-topic');
  });
});
