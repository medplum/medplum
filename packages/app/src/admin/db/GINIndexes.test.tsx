// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { ContentType, MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../../test-utils/render';
import { GINIndexes } from './GINIndexes';

describe('GINIndexes', () => {
  let medplum: MedplumClient;

  function setup(): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/admin/super/db']} initialIndex={0}>
          <MantineProvider>
            <Notifications />
            <GINIndexes />
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    const fetch = jest.fn(async (url) => {
      let status: number | undefined;
      let body: any;

      if (url.includes('ValueSet/$expand')) {
        status = 200;
        body = {
          resourceType: 'ValueSet',
          status: 'active',
          expansion: { timestamp: '2021-01-01T00:00:00.000Z', contains: [{ code: 'Login' } as any] },
        };
      } else if (url.includes('$db-indexes')) {
        status = 200;
        body = {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'defaultGinPendingListLimit',
              valueInteger: 4096,
            },
            {
              name: 'index',
              part: [
                {
                  name: 'tableName',
                  valueString: 'Login',
                },
                {
                  name: 'indexName',
                  valueString: 'Login___sharedTokens_idx',
                },
                {
                  name: 'indexOptions',
                  valueString: '{fastupdate=ye,gin_pending_list_limit=1024}',
                },
                {
                  name: 'fastUpdate',
                  valueBoolean: true,
                },
                {
                  name: 'ginPendingListLimit',
                  valueInteger: 1024,
                },
              ],
            },
          ],
        };
      } else {
        status = 404;
      }

      return {
        status,
        headers: {
          get(name: string): string | undefined {
            return {
              'content-type': ContentType.FHIR_JSON,
            }[name];
          },
        },
        json: jest.fn(async () => body),
      };
    });
    medplum = new MedplumClient({ fetch });
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

  test('GIN Indexes', async () => {
    setup();
    expect(screen.getByText('GIN index stats')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Login' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Login___sharedTokens_idx')).toBeInTheDocument();
    expect(screen.getByText('1024')).toBeInTheDocument();
    expect(screen.getByText('TRUE')).toBeInTheDocument();

    expect(await screen.queryByText('Details')).toBeNull();

    // trigger modal
    await act(async () => {
      fireEvent.click(screen.getByText('1024'));
    });

    // The title of the modal
    expect(await screen.findByText('Details')).toBeInTheDocument();
  });
});
