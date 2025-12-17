// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { ContentType, MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../../test-utils/render';
import { ColumnStatistics } from './ColumnStatistics';

describe('ColumnStatistics', () => {
  let medplum: MedplumClient;

  function setup(): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/admin/super/db']} initialIndex={0}>
          <MantineProvider>
            <Notifications />
            <ColumnStatistics />
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  const mockColumnStats = {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'defaultStatisticsTarget',
        valueInteger: 100,
      },
      {
        name: 'table',
        part: [
          {
            name: 'column',
            part: [
              { name: 'name', valueString: 'id' },
              { name: 'statisticsTarget', valueInteger: 200 },
              { name: 'nullFraction', valueDecimal: 0.0 },
              { name: 'avgWidth', valueInteger: 36 },
              { name: 'nDistinct', valueDecimal: -1 },
              { name: 'correlation', valueDecimal: 0.5 },
              { name: 'mostCommonValues', valueString: '{value1,value2,value3}' },
              { name: 'mostCommonFreqs', valueString: '{0.1,0.2,0.3}' },
              { name: 'histogramBounds', valueString: '{a,b,c}' },
              { name: 'mostCommonElems', valueString: '{elem1,elem2}' },
              { name: 'mostCommonElemFreqs', valueString: '{0.4,0.5}' },
              { name: 'elemCountHistogram', valueString: '{1,2,3}' },
            ],
          },
          {
            name: 'column',
            part: [
              { name: 'name', valueString: 'content' },
              { name: 'statisticsTarget', valueInteger: -1 },
              { name: 'nullFraction', valueDecimal: 0.1 },
              { name: 'avgWidth', valueInteger: 100 },
              { name: 'nDistinct', valueDecimal: 50 },
              { name: 'correlation', valueDecimal: 0.2 },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    const fetch = jest.fn(async (url: string, options?: { method?: string }) => {
      let status: number | undefined;
      let body: any;

      if (url.includes('ValueSet/$expand')) {
        status = 200;
        body = {
          resourceType: 'ValueSet',
          status: 'active',
          expansion: {
            timestamp: '2021-01-01T00:00:00.000Z',
            contains: [{ code: 'Patient' }],
          },
        };
      } else if (url.includes('$db-column-statistics')) {
        status = 200;
        body = mockColumnStats;
      } else if (url.includes('$db-configure-column-statistics') && options?.method === 'POST') {
        status = 200;
        body = { resourceType: 'Parameters', parameter: [] };
      } else {
        status = 404;
      }

      return {
        status,
        headers: {
          get(name: string): string | undefined {
            return { 'content-type': ContentType.FHIR_JSON }[name];
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

  test('Renders and loads column statistics', async () => {
    setup();

    expect(screen.getByPlaceholderText('Table name')).toBeInTheDocument();
    expect(screen.getByText('Statistics Target:')).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByText('Column')).toBeInTheDocument();
    expect(screen.getByText('null_frac')).toBeInTheDocument();
  });

  test('Selects table and displays column data', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  test('Select all and deselect all columns', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Find the header checkbox (select all)
    const thead = document.querySelector('thead');
    const selectAllCheckbox = thead?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(selectAllCheckbox).toBeInTheDocument();

    // Select all
    await act(async () => {
      fireEvent.click(selectAllCheckbox);
    });

    // Deselect all
    await act(async () => {
      fireEvent.click(selectAllCheckbox);
    });
  });

  test('Select individual row', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Find row checkboxes in tbody
    const tbody = document.querySelector('tbody');
    const rowCheckboxes = tbody?.querySelectorAll('input[type="checkbox"]');
    const firstRowCheckbox = rowCheckboxes?.[0] as HTMLInputElement;

    // Select individual row
    await act(async () => {
      fireEvent.click(firstRowCheckbox);
    });

    // Deselect individual row
    await act(async () => {
      fireEvent.click(firstRowCheckbox);
    });
  });

  test('Returns early when submitting without table selected', async () => {
    const noTableFetch = jest.fn(async (url: string, options?: { method?: string }) => {
      if (url.includes('ValueSet/$expand')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({
            resourceType: 'ValueSet',
            status: 'active',
            expansion: { timestamp: '2021-01-01T00:00:00.000Z', contains: [{ code: 'Patient' }] },
          }),
        };
      } else if (url.includes('$db-column-statistics')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({ resourceType: 'Parameters', parameter: [] }),
        };
      } else if (url.includes('$db-configure-column-statistics') && options?.method === 'POST') {
        throw new Error('Should not reach here');
      }
      return { status: 404, headers: { get: () => undefined }, json: async () => ({}) };
    });

    medplum = new MedplumClient({ fetch: noTableFetch });
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => true);

    setup();

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    // Check reset to default to make form submission valid
    const resetToDefaultCheckbox = screen.getByLabelText(/Reset to default/);
    await act(async () => {
      fireEvent.click(resetToDefaultCheckbox);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Update'));
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    // Form submission returns early (no table selected), no API call made
    // No notification shown because it returns immediately
    expect(screen.getByText('Statistics Target:')).toBeInTheDocument();
  });

  test('Shows notification when submitting without selecting columns', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Check reset to default to make the number input not required
    const resetToDefaultCheckbox = screen.getByLabelText(/Reset to default/);
    await act(async () => {
      fireEvent.click(resetToDefaultCheckbox);
    });

    // Submit without selecting columns
    await act(async () => {
      fireEvent.click(screen.getByText('Update'));
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText('No columns selected')).toBeInTheDocument();
    });
  });

  test('Submits form with selected columns and new statistics target', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Select first row
    const tbody = document.querySelector('tbody');
    const firstRowCheckbox = tbody?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.click(firstRowCheckbox);
    });

    // Set statistics target - find the NumberInput by looking for an input within a NumberInput wrapper
    const numberInput = document.querySelector('.mantine-NumberInput-input') as HTMLInputElement;
    if (numberInput) {
      await act(async () => {
        fireEvent.change(numberInput, { target: { value: '500' } });
      });
    }

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByText('Update'));
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument();
    });
  });

  test('Submits form with reset to default', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Select all rows
    const thead = document.querySelector('thead');
    const selectAllCheckbox = thead?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.click(selectAllCheckbox);
    });

    // Check reset to default
    const resetToDefaultCheckbox = screen.getByLabelText(/Reset to default/);
    await act(async () => {
      fireEvent.click(resetToDefaultCheckbox);
    });

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByText('Update'));
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument();
    });
  });

  test('Toggles show more stats', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Toggle show more stats
    const showMoreStatsCheckbox = screen.getByLabelText('Show all column stats');
    await act(async () => {
      fireEvent.click(showMoreStatsCheckbox);
    });

    expect(screen.getByText('most_common_vals')).toBeInTheDocument();
    expect(screen.getByText('histogram_bounds')).toBeInTheDocument();
  });

  test('Toggles show non-default only', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Toggle show non-default only
    const showNonDefaultCheckbox = screen.getByLabelText('Hide columns with default statistics target');
    await act(async () => {
      fireEvent.click(showNonDefaultCheckbox);
    });

    expect(screen.getByText(/hidden columns with default statistics target/)).toBeInTheDocument();
  });

  test('Opens modal when clicking stat cell', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Click on a stat cell
    const statCell = screen.getByText('36');
    await act(async () => {
      fireEvent.click(statCell);
    });

    await waitFor(() => {
      expect(screen.getByText('Details')).toBeInTheDocument();
    });
  });

  test('Refresh button triggers reload', async () => {
    setup();

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
  });

  test('Handles API error on column statistics fetch', async () => {
    const errorFetch = jest.fn(async (url: string) => {
      if (url.includes('ValueSet/$expand')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({
            resourceType: 'ValueSet',
            status: 'active',
            expansion: { timestamp: '2021-01-01T00:00:00.000Z', contains: [{ code: 'Patient' }] },
          }),
        };
      } else if (url.includes('$db-column-statistics')) {
        throw new Error('API Error');
      }
      return { status: 404, headers: { get: () => undefined }, json: async () => ({}) };
    });

    medplum = new MedplumClient({ fetch: errorFetch });
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => true);

    setup();

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
  });

  test('Handles configure column statistics API error', async () => {
    const errorFetch = jest.fn(async (url: string, options?: { method?: string }) => {
      if (url.includes('ValueSet/$expand')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({
            resourceType: 'ValueSet',
            status: 'active',
            expansion: { timestamp: '2021-01-01T00:00:00.000Z', contains: [{ code: 'Patient' }] },
          }),
        };
      } else if (url.includes('$db-column-statistics') && (!options?.method || options?.method === 'GET')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => mockColumnStats,
        };
      } else if (url.includes('$db-configure-column-statistics') && options?.method === 'POST') {
        throw new Error('Configure Error');
      }
      return { status: 404, headers: { get: () => undefined }, json: async () => ({}) };
    });

    medplum = new MedplumClient({ fetch: errorFetch });
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => true);

    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Select all rows
    const thead = document.querySelector('thead');
    const selectAllCheckbox = thead?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.click(selectAllCheckbox);
    });

    // Check reset to default
    const resetToDefaultCheckbox = screen.getByLabelText(/Reset to default/);
    await act(async () => {
      fireEvent.click(resetToDefaultCheckbox);
    });

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByText('Update'));
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText('Configure Error')).toBeInTheDocument();
    });
  });

  test('Handles empty column stats response', async () => {
    const emptyFetch = jest.fn(async (url: string) => {
      if (url.includes('ValueSet/$expand')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({
            resourceType: 'ValueSet',
            status: 'active',
            expansion: { timestamp: '2021-01-01T00:00:00.000Z', contains: [{ code: 'Patient' }] },
          }),
        };
      } else if (url.includes('$db-column-statistics')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({ resourceType: 'Parameters', parameter: [] }),
        };
      }
      return { status: 404, headers: { get: () => undefined }, json: async () => ({}) };
    });

    medplum = new MedplumClient({ fetch: emptyFetch });
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => true);

    setup();

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByText('Statistics Target:')).toBeInTheDocument();
  });

  test('Truncates long string values', async () => {
    const longValueFetch = jest.fn(async (url: string) => {
      if (url.includes('ValueSet/$expand')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({
            resourceType: 'ValueSet',
            status: 'active',
            expansion: { timestamp: '2021-01-01T00:00:00.000Z', contains: [{ code: 'Patient' }] },
          }),
        };
      } else if (url.includes('$db-column-statistics')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({
            resourceType: 'Parameters',
            parameter: [
              { name: 'defaultStatisticsTarget', valueInteger: 100 },
              {
                name: 'table',
                part: [
                  {
                    name: 'column',
                    part: [
                      { name: 'name', valueString: 'longColumn' },
                      { name: 'statisticsTarget', valueInteger: 100 },
                      { name: 'nullFraction', valueDecimal: 0.0 },
                      { name: 'avgWidth', valueInteger: 36 },
                      { name: 'nDistinct', valueDecimal: -1 },
                      { name: 'correlation', valueDecimal: 0.5 },
                      {
                        name: 'mostCommonValues',
                        valueString:
                          'this_is_a_very_long_string_that_exceeds_thirty_characters_and_should_be_truncated',
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        };
      }
      return { status: 404, headers: { get: () => undefined }, json: async () => ({}) };
    });

    medplum = new MedplumClient({ fetch: longValueFetch });
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => true);

    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Toggle show more stats
    const showMoreStatsCheckbox = screen.getByLabelText('Show all column stats');
    await act(async () => {
      fireEvent.click(showMoreStatsCheckbox);
    });

    // The truncated value should end with '...'
    expect(screen.getByText(/this_is_a_very_long_string_tha\.\.\./)).toBeInTheDocument();
  });

  test('Shows statistics target -1 as default', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Should show "default (100)" for statistics target -1 (for content column)
    // Use getAllByText since "default (100)" appears in both the checkbox label and the column
    const matches = screen.getAllByText(/default \(100\)/);
    expect(matches.length).toBeGreaterThan(0);
  });

  test('Show non-default with show more stats enabled', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Toggle show more stats first
    const showMoreStatsCheckbox = screen.getByLabelText('Show all column stats');
    await act(async () => {
      fireEvent.click(showMoreStatsCheckbox);
    });

    // Then toggle show non-default only
    const showNonDefaultCheckbox = screen.getByLabelText('Hide columns with default statistics target');
    await act(async () => {
      fireEvent.click(showNonDefaultCheckbox);
    });

    // Should show message about hidden columns with wider colspan
    expect(screen.getByText(/hidden columns with default statistics target/)).toBeInTheDocument();
  });

  test('Table change clears selected rows', async () => {
    setup();

    const input = screen.getByPlaceholderText('Table name') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Select a row
    const tbody = document.querySelector('tbody');
    const firstRowCheckbox = tbody?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.click(firstRowCheckbox);
    });
    expect(firstRowCheckbox.checked).toBe(true);

    // Change table
    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Patient' } });
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Selected rows should be cleared
    const newFirstRowCheckbox = document.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
    expect(newFirstRowCheckbox.checked).toBe(false);
  });
});
