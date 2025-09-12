// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { allOk } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../../test-utils/render';
import { GINIndexes } from './GINIndexes';

describe('GINIndexes', () => {
  let medplum: MockClient;

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
    medplum = new MockClient();
    jest.useFakeTimers();
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => true);

    medplum.router.add('GET', '$db-gin-indexes', async () => {
      return [
        allOk,
        {
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
                {
                  name: 'bytesPending',
                  valueInteger: 8192,
                },
                {
                  name: 'pendingHead',
                  valueString: '4294967295',
                },
                {
                  name: 'pendingTail',
                  valueString: '4294967295',
                },
                {
                  name: 'tailFreeSize',
                  valueInteger: 0,
                },
                {
                  name: 'nPendingPages',
                  valueString: '0',
                },
                {
                  name: 'nPendingTuples',
                  valueString: '0',
                },
                {
                  name: 'nTotalPages',
                  valueString: '2',
                },
                {
                  name: 'nEntryPages',
                  valueString: '1',
                },
                {
                  name: 'nDataPages',
                  valueString: '0',
                },
                {
                  name: 'nEntries',
                  valueString: '0',
                },
                {
                  name: 'version',
                  valueInteger: 2,
                },
              ],
            },
          ],
        },
      ];
    });
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
    expect(screen.getByText('Default gin_pending_list_limit:')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, {
        target: { value: 'Login' },
      });
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
      fireEvent.click(screen.getByText('8192'));
    });

    // The title of the modal
    expect(await screen.findByText('Details')).toBeInTheDocument();
  });
});
