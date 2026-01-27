// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../../test-utils/render';
import { ArrayColumnPadding } from './ArrayColumnPadding';

describe('ArrayColumnPadding', () => {
  let medplum: MockClient;

  function setup(): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/admin/super/db']} initialIndex={0}>
          <MantineProvider>
            <ArrayColumnPadding />
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    medplum = new MockClient();
  });

  test('renders input fields', () => {
    setup();
    expect(screen.getByLabelText('Statistics Target')).toBeInTheDocument();
    expect(screen.getByLabelText('Elements Per Row')).toBeInTheDocument();
    expect(screen.getByLabelText('Confidence')).toBeInTheDocument();
    expect(screen.getByLabelText('Target Selectivity (optional)')).toBeInTheDocument();
  });

  test('renders with default values and shows results', () => {
    setup();
    // Default values should produce valid results
    expect(screen.getByText('Intermediate Values')).toBeInTheDocument();
    expect(screen.getByText('Floor Option')).toBeInTheDocument();
    expect(screen.getByText('Ceiling Option')).toBeInTheDocument();
  });

  test('displays calculated intermediate values', () => {
    setup();
    // With defaults: statisticsTarget=1000, elemsPerRow=3, confidence=0.999999
    // rowsSampled = 1000 * 300 = 300000
    expect(screen.getByText('Rows Sampled')).toBeInTheDocument();
    expect(screen.getByText('300000')).toBeInTheDocument();
  });

  test('updates results when inputs change', async () => {
    setup();

    const statisticsInput = screen.getByLabelText('Statistics Target');

    await act(async () => {
      fireEvent.change(statisticsInput, { target: { value: '500' } });
    });

    // With statisticsTarget=500, rowsSampled should be 150000
    expect(screen.getByText('150000')).toBeInTheDocument();
  });

  test('hides results for invalid inputs', async () => {
    setup();

    const confidenceInput = screen.getByLabelText('Confidence');

    // Set confidence to invalid value (must be > 0 and < 1)
    await act(async () => {
      fireEvent.change(confidenceInput, { target: { value: '1.5' } });
    });

    // Results should not be shown
    expect(screen.queryByText('Intermediate Values')).not.toBeInTheDocument();
  });
});
