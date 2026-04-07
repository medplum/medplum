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

  test('hides results when confidence is cleared', async () => {
    setup();

    const confidenceInput = screen.getByLabelText('Confidence');

    // Clear the confidence input
    await act(async () => {
      fireEvent.change(confidenceInput, { target: { value: '' } });
    });

    // Results should not be shown
    expect(screen.queryByText('Intermediate Values')).not.toBeInTheDocument();
  });

  test('hides results when input is cleared', async () => {
    setup();

    // Verify results are initially shown
    expect(screen.getByText('Intermediate Values')).toBeInTheDocument();

    const statisticsInput = screen.getByLabelText('Statistics Target');

    // Clear the input
    await act(async () => {
      fireEvent.change(statisticsInput, { target: { value: '' } });
    });

    // Results should not be shown when required input is empty
    expect(screen.queryByText('Intermediate Values')).not.toBeInTheDocument();
  });

  test('updates results when elements per row changes', async () => {
    setup();

    const elemsInput = screen.getByLabelText('Elements Per Row');

    await act(async () => {
      fireEvent.change(elemsInput, { target: { value: '5' } });
    });

    // With elemsPerRow=5, cutoffFrequencyExact changes
    // cutoffFrequencyExact = (9 * 5 * 300000) / ((1000 * 10 * 1000) / 7) = 9.45
    // cutoffFrequency = ceil(9.45) = 10
    // There may be multiple '10' values on screen, so use getAllByText
    expect(screen.getAllByText('10').length).toBeGreaterThanOrEqual(1);
  });

  test('updates results when confidence changes', async () => {
    setup();

    const confidenceInput = screen.getByLabelText('Confidence');

    await act(async () => {
      fireEvent.change(confidenceInput, { target: { value: '0.99' } });
    });

    // Results should still be shown with valid confidence
    expect(screen.getByText('Intermediate Values')).toBeInTheDocument();
  });

  test('displays all intermediate value labels', () => {
    setup();

    // Left column
    expect(screen.getByText('Rows Sampled')).toBeInTheDocument();
    expect(screen.getByText('Cutoff Frequency (exact)')).toBeInTheDocument();
    expect(screen.getByText('Cutoff Frequency')).toBeInTheDocument();
    expect(screen.getByText('Min Selectivity')).toBeInTheDocument();

    // Right column
    expect(screen.getByText('Target Selectivity')).toBeInTheDocument();
    expect(screen.getByText('Target Lambda')).toBeInTheDocument();
    expect(screen.getByText('Target Poisson CDF')).toBeInTheDocument();
    expect(screen.getByText('Target m')).toBeInTheDocument();
  });

  test('displays result group labels', () => {
    setup();

    // Floor option
    expect(screen.getByText('Floor Option')).toBeInTheDocument();

    // Ceiling option
    expect(screen.getByText('Ceiling Option')).toBeInTheDocument();

    // Result row labels (appear twice - once in each option)
    expect(screen.getAllByText('M (padding multiplier)')).toHaveLength(2);
    expect(screen.getAllByText('Poisson CDF')).toHaveLength(2);
    expect(screen.getAllByText('Lambda')).toHaveLength(2);
    expect(screen.getAllByText('F (selectivity)')).toHaveLength(2);
  });

  test('displays cutoff frequency value', () => {
    setup();

    // With defaults: statisticsTarget=1000, elemsPerRow=3
    // cutoffFrequency = ceil(5.67) = 6
    // Target Lambda also equals 6, so there are multiple '6' values
    expect(screen.getAllByText('6').length).toBeGreaterThanOrEqual(1);
  });

  test('shows placeholder on selectivity override input', () => {
    setup();

    const selectivityInput = screen.getByLabelText('Target Selectivity (optional)');

    // The placeholder should show the minimum selectivity in scientific notation
    expect(selectivityInput).toHaveAttribute('placeholder');
    const placeholder = selectivityInput.getAttribute('placeholder');
    expect(placeholder).toMatch(/e-/); // Scientific notation
  });

  test('accepts selectivity override value', async () => {
    setup();

    const selectivityInput = screen.getByLabelText('Target Selectivity (optional)');

    await act(async () => {
      fireEvent.change(selectivityInput, { target: { value: '0.001' } });
    });

    // Results should still be shown
    expect(screen.getByText('Intermediate Values')).toBeInTheDocument();
  });
});
