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

vi.mock('./SearchableMultiSelect', () => ({
  SearchableMultiSelect: ({ onChange }: { onChange: (value: string[]) => void }) => (
    <button type="button" onClick={() => onChange(['Patient'])}>
      Select Patient
    </button>
  ),
}));
vi.mock('./useAvailableTables', () => ({ useAvailableTables: vi.fn() }));

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
          makeGinIndexParameter('Patient', 'Patient_name_idx', 500 * 1024 * 1024, 2.5),
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

    expect(getBloatRequests(fetch)).toHaveLength(0);
    expect(screen.getByText('Click Analyze to scan indexes for bloat.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => expect(screen.getByText('Observation_date_idx')).toBeInTheDocument());
    expect(screen.getByText('Patient_name_idx')).toBeInTheDocument();
    expect(getBloatRequests(fetch)).toHaveLength(1);
    expect(getBloatRequests(fetch)[0]).toContain('fhir/R4/$db-index-bloat?minBloatPercent=30&minIndexSize=104857600');
    expect(screen.getByText('2.50')).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Observation_date_idx');
    expect(rows[2]).toHaveTextContent('Patient_name_idx');
  });

  test('Filters analysis by selected tables', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Select Patient' }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => expect(getBloatRequests(fetch)).toHaveLength(1));
    expect(getBloatRequests(fetch)[0]).toContain('tableName=Patient');
  });

  test('Shows an empty state', async () => {
    fetch.mockImplementationOnce(async () => ({
      status: 200,
      headers: { get: () => ContentType.FHIR_JSON },
      json: vi.fn(async () => ({ resourceType: 'Parameters' })),
    }));
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(await screen.findByText('No indexes meet the selected thresholds.')).toBeInTheDocument();
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

function makeGinIndexParameter(
  tableName: string,
  indexName: string,
  indexSize: number,
  liveTuplesPerPage: number
): object {
  const allocatedPages = 500;
  const liveTuples = allocatedPages * liveTuplesPerPage;
  return {
    name: 'index',
    part: [
      { name: 'schemaName', valueString: 'public' },
      { name: 'tableName', valueString: tableName },
      { name: 'indexName', valueString: indexName },
      { name: 'indexType', valueCode: 'gin' },
      { name: 'indexSize', valueDecimal: indexSize },
      { name: 'liveTuples', valueDecimal: liveTuples },
      { name: 'allocatedPages', valueDecimal: allocatedPages },
      { name: 'liveTuplesPerPage', valueDecimal: liveTuplesPerPage },
    ],
  };
}

function getBloatRequests(fetch: Mock<FetchLike>): string[] {
  return fetch.mock.calls.map((call) => String(call[0])).filter((url) => url.includes('$db-index-bloat'));
}
