// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, render, screen } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react';
import { MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { HistoryList } from './HistoryList';
import * as spacePersistence from '../../utils/spacePersistence';

const mockTopics = [
  {
    resourceType: 'Communication',
    id: 'topic-1',
    meta: { lastUpdated: '2023-01-01T10:00:00Z' },
    topic: { text: 'Topic 1' },
  },
  {
    resourceType: 'Communication',
    id: 'topic-2',
    meta: { lastUpdated: '2023-01-02T10:00:00Z' },
    topic: { text: 'Topic 2' },
  },
];

describe('HistoryList', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    vi.spyOn(spacePersistence, 'loadRecentTopics').mockResolvedValue(mockTopics as any);
  });

  const setup = (currentTopicId?: string): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <HistoryList
              currentTopicId={currentTopicId}
              onSelectTopic={vi.fn()}
              onSelectedItem={(topic) => `/Spaces/Communication/${topic.id}`}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders loading state initially', async () => {
    vi.spyOn(spacePersistence, 'loadRecentTopics').mockImplementation(() => new Promise(() => {}));

    setup();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('renders empty state when no topics', async () => {
    vi.spyOn(spacePersistence, 'loadRecentTopics').mockResolvedValue([]);

    await act(async () => {
      setup();
    });

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  test('renders list of topics', async () => {
    await act(async () => {
      setup();
    });

    expect(screen.getByText('Recent Conversations')).toBeInTheDocument();
    expect(screen.getByText('Topic 1')).toBeInTheDocument();
    expect(screen.getByText('Topic 2')).toBeInTheDocument();
  });

  test('generates correct links', async () => {
    await act(async () => {
      setup();
    });

    const link1 = screen.getByText('Topic 1').closest('a');
    expect(link1).toHaveAttribute('href', '/Spaces/Communication/topic-1');

    const link2 = screen.getByText('Topic 2').closest('a');
    expect(link2).toHaveAttribute('href', '/Spaces/Communication/topic-2');
  });
});
