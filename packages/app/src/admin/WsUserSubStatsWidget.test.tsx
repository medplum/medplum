// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { allOk } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { act, render, screen } from '../test-utils/render';
import { WsUserSubStatsWidget } from './WsUserSubStatsWidget';

describe('WsUserSubStatsWidget', () => {
  const userRef = 'Practitioner/test-practitioner-1';

  const mockStats = {
    userRef,
    totalCount: 3,
    criteriaGroups: [
      {
        criteria: 'Observation?subject=Patient/123',
        count: 2,
        refs: [
          { ref: 'Subscription/sub-1', active: true },
          { ref: 'Subscription/sub-2', active: false },
        ],
      },
      {
        criteria: 'Stale',
        count: 1,
        refs: [{ ref: 'Subscription/sub-3', active: false }],
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
            <WsUserSubStatsWidget />
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

  test('renders button and profile input', async () => {
    setup();
    expect(screen.getByRole('button', { name: 'Get User WS Stats' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Practitioner or Patient')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('All projects')).toBeInTheDocument();
  });

  test('button is disabled when no profile selected', async () => {
    setup();
    expect(screen.getByRole('button', { name: 'Get User WS Stats' })).toBeDisabled();
  });

  test('get-user-ws-stats returns criteria groups and stale entries', async () => {
    medplum.router.add('POST', '$get-user-ws-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'stats', valueString: JSON.stringify(mockStats) }],
      },
    ]);

    const params = await medplum.post<{ resourceType: string; parameter: any[] }>('fhir/R4/$get-user-ws-stats', {
      resourceType: 'Parameters',
      parameter: [{ name: 'userRef', valueReference: { reference: userRef } }],
    });
    const parsed = JSON.parse(params.parameter[0].valueString);

    expect(parsed.totalCount).toBe(3);
    expect(parsed.criteriaGroups).toHaveLength(2);
    expect(parsed.criteriaGroups[0].criteria).toBe('Observation?subject=Patient/123');
    expect(parsed.criteriaGroups[0].refs).toEqual([
      { ref: 'Subscription/sub-1', active: true },
      { ref: 'Subscription/sub-2', active: false },
    ]);
    expect(parsed.criteriaGroups[1].criteria).toBe('Stale');
    expect(parsed.criteriaGroups[1].refs).toEqual([{ ref: 'Subscription/sub-3', active: false }]);
  });

  test('get-user-ws-stats returns empty stats when no subscriptions', async () => {
    medplum.router.add('POST', '$get-user-ws-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'stats',
            valueString: JSON.stringify({ userRef, totalCount: 0, criteriaGroups: [] }),
          },
        ],
      },
    ]);

    const params = await medplum.post<{ resourceType: string; parameter: any[] }>('fhir/R4/$get-user-ws-stats', {
      resourceType: 'Parameters',
      parameter: [{ name: 'userRef', valueReference: { reference: userRef } }],
    });
    const parsed = JSON.parse(params.parameter[0].valueString);

    expect(parsed.totalCount).toBe(0);
    expect(parsed.criteriaGroups).toHaveLength(0);
  });

  test('clear-user-ws-stats deletes user active set key', async () => {
    medplum.router.add('POST', '$clear-user-ws-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'deleted', valueInteger: 1 }],
      },
    ]);

    const result = await medplum.post<{ resourceType: string; parameter: any[] }>('fhir/R4/$clear-user-ws-stats', {
      resourceType: 'Parameters',
      parameter: [{ name: 'userRef', valueReference: { reference: userRef } }],
    });

    const deleted = result.parameter?.find((p: any) => p.name === 'deleted')?.valueInteger;
    expect(deleted).toBe(1);
  });

  test('stale-only stats response is parsed correctly', async () => {
    const staleOnlyStats = {
      userRef,
      totalCount: 2,
      criteriaGroups: [
        {
          criteria: 'Stale',
          count: 2,
          refs: [
            { ref: 'Subscription/orphan-1', active: false },
            { ref: 'Subscription/orphan-2', active: false },
          ],
        },
      ],
    };

    medplum.router.add('POST', '$get-user-ws-stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'stats', valueString: JSON.stringify(staleOnlyStats) }],
      },
    ]);

    const params = await medplum.post<{ resourceType: string; parameter: any[] }>('fhir/R4/$get-user-ws-stats', {
      resourceType: 'Parameters',
      parameter: [{ name: 'userRef', valueReference: { reference: userRef } }],
    });
    const parsed = JSON.parse(params.parameter[0].valueString);

    expect(parsed.criteriaGroups).toHaveLength(1);
    expect(parsed.criteriaGroups[0].criteria).toBe('Stale');
    expect(parsed.criteriaGroups[0].count).toBe(2);
  });
});
