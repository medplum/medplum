// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { allOk, forbidden } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { WsSubStatsWidget } from './WsSubStatsWidget';

describe('WsSubStatsWidget', () => {
  const mockStats = {
    projects: [
      {
        projectId: 'project-1',
        projectName: 'Test Project Alpha',
        subscriptionCount: 4,
        resourceTypes: [
          {
            resourceType: 'Observation',
            count: 3,
            criteria: [
              { criteria: 'Observation?code=85354-9', count: 2 },
              { criteria: 'Observation?status=final', count: 1 },
            ],
          },
          {
            resourceType: 'Patient',
            count: 1,
            criteria: [{ criteria: 'Patient?name=Alice', count: 1 }],
          },
        ],
      },
    ],
  };

  let medplum: MockClient;

  function setup(): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <MantineProvider>
            <Notifications />
            <WsSubStatsWidget />
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    medplum = new MockClient();
    jest.useFakeTimers();
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => true);
  });

  afterEach(async () => {
    await act(async () => notifications.clean());
    jest.clearAllMocks();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('button renders on page', async () => {
    setup();
    expect(screen.getByRole('button', { name: 'Get WS Sub Stats' })).toBeInTheDocument();
  });

  test('empty state shows message when no subscriptions', async () => {
    medplum.router.add('GET', '$get-ws-sub-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'stats', valueString: JSON.stringify({ projects: [] }) }],
      },
    ]);

    setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Get WS Sub Stats' }));
    });

    expect(await screen.findByText('No active WebSocket subscriptions found.')).toBeInTheDocument();
  });

  test('opens modal with project rows on success', async () => {
    medplum.router.add('GET', '$get-ws-sub-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'stats', valueString: JSON.stringify(mockStats) }],
      },
    ]);

    setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Get WS Sub Stats' }));
    });

    expect(await screen.findByText('WebSocket Subscription Stats')).toBeInTheDocument();
    expect(await screen.findByText('Test Project Alpha')).toBeInTheDocument();
    expect(await screen.findByText('4')).toBeInTheDocument();
  });

  test('expands project row to show resource types', async () => {
    medplum.router.add('GET', '$get-ws-sub-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'stats', valueString: JSON.stringify(mockStats) }],
      },
    ]);

    setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Get WS Sub Stats' }));
    });

    await screen.findByText('Test Project Alpha');

    // Resource types not yet visible
    expect(screen.queryByText('Observation')).not.toBeInTheDocument();

    // Click the project row (via closest <tr> to avoid anchor interfering)
    const projectRow = screen.getByText('Test Project Alpha').closest('tr') as HTMLElement;
    await act(async () => {
      fireEvent.click(projectRow);
    });

    // Observation and its count are visible
    expect(screen.getByText('Observation')).toBeInTheDocument();
    // Both resource types are represented (Patient appears in nav so check via row count)
    const rows = screen.getAllByRole('row');
    // header + project + 2 resource type rows = 4
    expect(rows).toHaveLength(4);
  });

  test('collapses project row on second click', async () => {
    medplum.router.add('GET', '$get-ws-sub-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'stats', valueString: JSON.stringify(mockStats) }],
      },
    ]);

    setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Get WS Sub Stats' }));
    });

    await screen.findByText('Test Project Alpha');

    const projectRow = screen.getByText('Test Project Alpha').closest('tr') as HTMLElement;

    await act(async () => {
      fireEvent.click(projectRow);
    });

    expect(screen.getByText('Observation')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(projectRow);
    });

    expect(screen.queryByText('Observation')).not.toBeInTheDocument();
  });

  test('expands resource type row to show criteria', async () => {
    medplum.router.add('GET', '$get-ws-sub-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'stats', valueString: JSON.stringify(mockStats) }],
      },
    ]);

    const projectDetailStats = {
      projectId: 'project-1',
      resourceTypes: [
        {
          resourceType: 'Observation',
          count: 3,
          criteria: [
            {
              criteria: 'Observation?code=85354-9',
              count: 2,
              entries: [
                {
                  subscriptionId: 'sub1',
                  criteria: 'Observation?code=85354-9',
                  expiration: 1700000000,
                  author: 'Practitioner/author1',
                },
                {
                  subscriptionId: 'sub2',
                  criteria: 'Observation?code=85354-9',
                  expiration: 1700001000,
                  author: 'Practitioner/author2',
                },
              ],
            },
            {
              criteria: 'Observation?status=final',
              count: 1,
              entries: [
                {
                  subscriptionId: 'sub3',
                  criteria: 'Observation?status=final',
                  expiration: 1700002000,
                  author: 'Practitioner/author3',
                },
              ],
            },
          ],
        },
        {
          resourceType: 'Patient',
          count: 1,
          criteria: [
            {
              criteria: 'Patient?name=Alice',
              count: 1,
              entries: [
                {
                  subscriptionId: 'sub4',
                  criteria: 'Patient?name=Alice',
                  expiration: 1700003000,
                  author: 'Practitioner/author4',
                },
              ],
            },
          ],
        },
      ],
    };

    medplum.router.add('GET', '$get-ws-sub-project-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'stats', valueString: JSON.stringify(projectDetailStats) }],
      },
    ]);

    setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Get WS Sub Stats' }));
    });

    await screen.findByText('Test Project Alpha');

    // Expand project row
    const projectRow = screen.getByText('Test Project Alpha').closest('tr') as HTMLElement;
    await act(async () => {
      fireEvent.click(projectRow);
    });

    expect(screen.queryByText('Observation?code=85354-9')).not.toBeInTheDocument();

    // Expand Observation resource type row
    const resourceTypeRow = screen.getByText('Observation').closest('tr') as HTMLElement;
    await act(async () => {
      fireEvent.click(resourceTypeRow);
    });

    expect(await screen.findByText('Observation?code=85354-9')).toBeInTheDocument();
    expect(screen.getByText('Observation?status=final')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('expands criteria row to show entries', async () => {
    medplum.router.add('GET', '$get-ws-sub-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'stats', valueString: JSON.stringify(mockStats) }],
      },
    ]);

    const projectDetailStats = {
      projectId: 'project-1',
      resourceTypes: [
        {
          resourceType: 'Observation',
          count: 3,
          criteria: [
            {
              criteria: 'Observation?code=85354-9',
              count: 2,
              entries: [
                {
                  subscriptionId: 'sub1',
                  criteria: 'Observation?code=85354-9',
                  expiration: 1700000000,
                  author: 'Practitioner/author1',
                },
                {
                  subscriptionId: 'sub2',
                  criteria: 'Observation?code=85354-9',
                  expiration: 1700001000,
                  author: 'Practitioner/author2',
                },
              ],
            },
          ],
        },
      ],
    };

    medplum.router.add('GET', '$get-ws-sub-project-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'stats', valueString: JSON.stringify(projectDetailStats) }],
      },
    ]);

    setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Get WS Sub Stats' }));
    });

    await screen.findByText('Test Project Alpha');

    // Expand project
    const projectRow = screen.getByText('Test Project Alpha').closest('tr') as HTMLElement;
    await act(async () => {
      fireEvent.click(projectRow);
    });

    // Expand resource type
    const resourceTypeRow = screen.getByText('Observation').closest('tr') as HTMLElement;
    await act(async () => {
      fireEvent.click(resourceTypeRow);
    });

    await screen.findByText('Observation?code=85354-9');

    // Entries not yet visible
    expect(screen.queryByText(/sub1/)).not.toBeInTheDocument();

    // Expand criteria row
    const criteriaRow = screen.getByText('Observation?code=85354-9').closest('tr') as HTMLElement;
    await act(async () => {
      fireEvent.click(criteriaRow);
    });

    // Entries should now be visible with labeled lines
    expect(screen.getByText(/Subscription\/sub1/)).toBeInTheDocument();
    expect(screen.getByText(/Subscription\/sub2/)).toBeInTheDocument();
    expect(screen.getAllByText(/Expires at:/)).toHaveLength(2);
  });

  test('shows error notification on failure', async () => {
    medplum.router.add('GET', '$get-ws-sub-stats', async () => [forbidden]);

    setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Get WS Sub Stats' }));
    });

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
  });
});
