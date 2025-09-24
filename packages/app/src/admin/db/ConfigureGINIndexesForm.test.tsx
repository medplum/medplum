// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { allOk } from '@medplum/core';
import { Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../../test-utils/render';
import { ConfigureGINIndexesForm } from './ConfigureGINIndexesForm';

describe('ConfigureGINIndexesForm', () => {
  let medplum: MockClient;
  const defaultGinPendingListLimit = 5555;
  const availableTables = ['Foobar', 'Foobar_History', 'Foobar_References'];
  let response: Parameters;
  let onResponse: jest.MockedFn<(response: Parameters) => void>;

  function setup(): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/admin/super/db']} initialIndex={0}>
          <MantineProvider>
            <Notifications />
            <ConfigureGINIndexesForm
              defaultGinPendingListLimit={defaultGinPendingListLimit}
              availableTables={availableTables}
              onResponse={onResponse}
            />
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    onResponse = jest.fn();

    medplum = new MockClient();
    response = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'result',
          part: [
            {
              name: 'schemaName',
              valueString: 'public',
            },
            {
              name: 'tableName',
              valueString: 'Foobar',
            },
            {
              name: 'indexName',
              valueString: 'Foobar_compartments_idx',
            },
            {
              name: 'pagesCleaned',
              valueString: '0',
            },
          ],
        },
        {
          name: 'result',
          part: [
            {
              name: 'schemaName',
              valueString: 'public',
            },
            {
              name: 'tableName',
              valueString: 'Foobar',
            },
            {
              name: 'indexName',
              valueString: 'Foobar_basedOn_idx',
            },
            {
              name: 'pagesCleaned',
              valueString: '0',
            },
          ],
        },
      ],
    };
    jest.useFakeTimers();
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => true);

    medplum.router.add('POST', '$db-configure-indexes', async () => {
      return [allOk, response];
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

  test.each([
    ['off', 'unspecified', undefined],
    ['on', 'reset to default (5555kB)', undefined],
    ['reset to default (on)', 'Set to (kB)', 1234],
  ])('Submit form', async (fastUpdateText, ginPendingListLimitText, ginPendingListLimitValue) => {
    setup();
    expect(screen.getByText('reset to default (on)')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('e.g. Observation') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, {
        target: { value: 'Foobar' },
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

    // Click fastupdate option
    await act(async () => {
      fireEvent.click(within(screen.getByLabelText('fastupdate')).getByText(fastUpdateText));
    });

    // Click ginPendingListLimit option
    await act(async () => {
      fireEvent.click(within(screen.getByLabelText('gin_pending_list_limit')).getByText(ginPendingListLimitText));
    });

    if (ginPendingListLimitValue !== undefined) {
      await act(async () => {
        fireEvent.change(screen.getByTitle('gin_pending_list_limit_value'), {
          target: { value: ginPendingListLimitValue },
        });
      });
    }

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByText('Update'));
    });

    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledWith(response);
  });
});
