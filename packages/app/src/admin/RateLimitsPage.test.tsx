// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk } from '@medplum/core';
import type { OperationOutcome, Parameters, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderAppRoutes, screen, waitFor } from '../test-utils/render';

const medplum = new MockClient();

let rateLimitsHandler: () => [OperationOutcome] | [OperationOutcome, Resource];

medplum.router.add('GET', 'Project/:id/$rate-limits', async () => {
  return rateLimitsHandler();
});

function fullResponse(): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'project',
        part: [
          { name: 'id', valueString: '123' },
          { name: 'limit', valueInteger: 500000 },
          { name: 'consumedPoints', valueInteger: 150000 },
          { name: 'remainingPoints', valueInteger: 350000 },
          { name: 'msBeforeReset', valueInteger: 45000 },
        ],
      },
      {
        name: 'membership',
        part: [
          { name: 'membershipId', valueString: 'mem-1' },
          { name: 'profileReference', valueString: 'Practitioner/practitioner-1' },
          { name: 'limit', valueInteger: 50000 },
          { name: 'consumedPoints', valueInteger: 45000 },
          { name: 'remainingPoints', valueInteger: 5000 },
          { name: 'msBeforeReset', valueInteger: 30000 },
        ],
      },
      {
        name: 'membership',
        part: [
          { name: 'membershipId', valueString: 'mem-2' },
          { name: 'profileReference', valueString: 'Practitioner/practitioner-2' },
          { name: 'limit', valueInteger: 50000 },
          { name: 'consumedPoints', valueInteger: 10000 },
          { name: 'remainingPoints', valueInteger: 40000 },
          { name: 'msBeforeReset', valueInteger: 50000 },
        ],
      },
    ],
  };
}

async function setup(url = '/admin/rate-limits'): Promise<void> {
  renderAppRoutes(medplum, url);
}

describe('RateLimitsPage', () => {
  beforeAll(() => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/123',
      },
      project: {
        reference: 'Project/123',
      },
    });
  });

  beforeEach(() => {
    rateLimitsHandler = () => [allOk, fullResponse()];
  });

  test('Renders initial state with refresh button', async () => {
    await setup();
    expect(await screen.findByRole('heading', { name: 'Rate Limits' })).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
    expect(screen.getByText('Click Refresh to load current rate limit data.')).toBeInTheDocument();
  });

  test('Fetches and displays data on refresh click', async () => {
    await setup();
    expect(await screen.findByText('Refresh')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });

    await waitFor(() => {
      expect(screen.getByText('Project Utilization')).toBeInTheDocument();
    });

    expect(screen.getByText('Membership Utilization')).toBeInTheDocument();
    expect(screen.getByText('Practitioner/practitioner-1')).toBeInTheDocument();
    expect(screen.getByText('Practitioner/practitioner-2')).toBeInTheDocument();
    expect(screen.getByText('mem-1')).toBeInTheDocument();
    expect(screen.getByText('mem-2')).toBeInTheDocument();
  });

  test('Displays project utilization data', async () => {
    await setup();
    expect(await screen.findByText('Refresh')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });

    await waitFor(() => {
      expect(screen.getByText('Project Utilization')).toBeInTheDocument();
    });

    expect(screen.getByText(/150,000/)).toBeInTheDocument();
    expect(screen.getByText(/500,000/)).toBeInTheDocument();
    expect(screen.getByText(/30\.0%/)).toBeInTheDocument();
  });

  test('Sorts memberships by utilization descending by default', async () => {
    await setup();
    expect(await screen.findByText('Refresh')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });

    await waitFor(() => {
      expect(screen.getByText('Membership Utilization')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Practitioner/practitioner-1');
    expect(rows[2]).toHaveTextContent('Practitioner/practitioner-2');
  });

  test('Toggles sort direction on utilization header click', async () => {
    await setup();
    expect(await screen.findByText('Refresh')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });

    await waitFor(() => {
      expect(screen.getByText('Membership Utilization')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Utilization'));
    });

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Practitioner/practitioner-2');
    expect(rows[2]).toHaveTextContent('Practitioner/practitioner-1');
  });

  test('Handles empty rate limit data', async () => {
    rateLimitsHandler = () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'project',
            part: [{ name: 'id', valueString: '123' }],
          },
        ],
      } as Parameters,
    ];

    await setup();
    expect(await screen.findByText('Refresh')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });

    await waitFor(() => {
      expect(screen.getByText('No project-level rate limit data recorded yet.')).toBeInTheDocument();
    });

    expect(screen.getByText('No membership rate limit data found.')).toBeInTheDocument();
  });

  test('Handles fetch error', async () => {
    rateLimitsHandler = () => [
      {
        resourceType: 'OperationOutcome',
        id: 'not-found',
        issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Rate limit error' }],
      },
    ] as [OperationOutcome];

    await setup();
    expect(await screen.findByText('Refresh')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });

    // After error, should still show the initial prompt (no data loaded)
    await waitFor(() => {
      expect(screen.getByText('Click Refresh to load current rate limit data.')).toBeInTheDocument();
    });
  });

  test('Rows are clickable and link to membership detail page', async () => {
    await setup();
    expect(await screen.findByText('Refresh')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });

    await waitFor(() => {
      expect(screen.getByText('Membership Utilization')).toBeInTheDocument();
    });

    const row = screen.getByText('mem-1').closest('tr')!;
    expect(row).toHaveStyle('cursor: pointer');
  });

  test('Shows Rate Limits tab in navigation', async () => {
    await setup('/admin/rate-limits');
    expect(await screen.findByRole('tab', { name: 'Rate Limits' })).toBeInTheDocument();
  });
});
