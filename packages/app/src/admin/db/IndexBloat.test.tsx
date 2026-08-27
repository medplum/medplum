// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { FetchLike } from '@medplum/core';
import { ContentType, MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '../../test-utils/render';
import { IndexBloat } from './IndexBloat';
import { formatBytes } from './utils';

describe('IndexBloat', () => {
  let medplum: MedplumClient;
  let fetch: Mock<FetchLike>;

  function setup(): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/admin/super/db/index-bloat']}>
          <MantineProvider>
            <Notifications />
            <IndexBloat />
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetch = vi.fn(async () => ({
      status: 200,
      headers: { get: () => ContentType.FHIR_JSON },
      json: vi.fn(async () => ({
        resourceType: 'Parameters',
        parameter: [
          makeIndexParameter('Patient', 'Patient_name_idx', 'gin', 500 * 1024 * 1024, 200 * 1024 * 1024, 40),
          makeIndexParameter(
            'Observation',
            'Observation_date_idx',
            'btree',
            800 * 1024 * 1024,
            300 * 1024 * 1024,
            37.5
          ),
        ],
      })),
    }));
    medplum = new MedplumClient({ fetch });
  });

  afterEach(async () => {
    await act(async () => notifications.clean());
    vi.clearAllMocks();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();
  });

  test('Runs only after Analyze and renders sorted results', async () => {
    setup();

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText('Click Analyze to scan indexes for bloat.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => expect(screen.getByText('Observation_date_idx')).toBeInTheDocument());
    expect(screen.getByText('Patient_name_idx')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain(
      'fhir/R4/$db-index-bloat?minBloatPercent=30&minBloatBytes=104857600'
    );

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Observation_date_idx');
    expect(rows[2]).toHaveTextContent('Patient_name_idx');
  });

  test('Shows an empty state', async () => {
    fetch.mockImplementationOnce(async () => ({
      status: 200,
      headers: { get: () => ContentType.FHIR_JSON },
      json: vi.fn(async () => ({ resourceType: 'Parameters' })),
    }));
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(await screen.findByText('No indexes exceed both thresholds.')).toBeInTheDocument();
  });

  test('Shows request errors', async () => {
    fetch.mockImplementationOnce(async () => ({
      status: 400,
      statusText: 'Bad Request',
      headers: { get: () => ContentType.FHIR_JSON },
      json: vi.fn(async () => ({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'exception', details: { text: 'Unable to analyze indexes' } }],
      })),
    }));
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(await screen.findByText('Analysis failed')).toBeInTheDocument();
  });

  test('Formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
  });
});

function makeIndexParameter(
  tableName: string,
  indexName: string,
  indexType: string,
  indexSize: number,
  estimatedBloatSize: number,
  bloatPercent: number
): object {
  return {
    name: 'index',
    part: [
      { name: 'schemaName', valueString: 'public' },
      { name: 'tableName', valueString: tableName },
      { name: 'indexName', valueString: indexName },
      { name: 'indexType', valueCode: indexType },
      { name: 'indexSize', valueDecimal: indexSize },
      { name: 'estimatedBloatSize', valueDecimal: estimatedBloatSize },
      { name: 'bloatPercent', valueDecimal: bloatPercent },
    ],
  };
}
