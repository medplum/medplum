// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SmartHealthLinkPatientStepProps } from './SmartHealthLinkPatientStep';
import { SmartHealthLinkPatientStep } from './SmartHealthLinkPatientStep';

const SHARED_PATIENT: Patient = {
  resourceType: 'Patient',
  id: 'shared-patient',
  name: [{ given: ['Homer'], family: 'Simpson' }],
  birthDate: '1956-05-12',
};

const CERTAIN_MATCH: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'local-certain',
  name: [{ given: ['Homer', 'J'], family: 'Simpson' }],
  birthDate: '1956-05-12',
};

const POSSIBLE_MATCH: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'local-possible',
  name: [{ given: ['Homer'], family: 'Simpsonn' }],
};

describe('SmartHealthLinkPatientStep', () => {
  let medplum: MockClient;
  let props: SmartHealthLinkPatientStepProps;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    props = {
      sharedPatient: SHARED_PATIENT,
      sourceKind: 'Link',
      sourceOrigin: 'https://issuer.example.com',
      expiresAt: undefined,
      importableCount: 7,
      matches: [],
      selectionValue: '',
      onSelectionChange: vi.fn(),
      canContinue: false,
      onContinue: vi.fn(),
    };
  });

  function setup(overrides: Partial<SmartHealthLinkPatientStepProps> = {}): ReturnType<typeof render> {
    props = { ...props, ...overrides };
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <SmartHealthLinkPatientStep {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  describe('Shared details', () => {
    test('Summarizes the shared patient, source and record count', () => {
      setup();
      expect(screen.getByText('SMART Health Link Details')).toBeInTheDocument();
      expect(screen.getByText('1956-05-12')).toBeInTheDocument();
      expect(screen.getByText('https://issuer.example.com')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
    });

    test('Titles the section for a card', () => {
      setup({ sourceKind: 'Card' });
      expect(screen.getByText('SMART Health Card Details')).toBeInTheDocument();
    });

    test('Falls back to placeholders for a missing source, expiration and birth date', () => {
      setup({ sourceOrigin: undefined, sharedPatient: { ...SHARED_PATIENT, birthDate: undefined } });
      // Once in the details grid, once on the new patient card.
      expect(screen.getAllByText('No birth date')).toHaveLength(2);
      // Both Source and Records Sharing Expiration are unknown.
      expect(screen.getAllByText('—')).toHaveLength(2);
    });

    test('Formats a declared expiration as a local date and time', () => {
      setup({ expiresAt: '2099-01-02T15:04:00Z' });
      const expected = new Date('2099-01-02T15:04:00Z').toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    test('Notices a past expiration without blocking the import', () => {
      setup({ expiresAt: new Date(Date.now() - 60_000).toISOString() });
      expect(
        screen.getByText('This link has expired, but its records are still available and can be imported.')
      ).toBeInTheDocument();
    });

    test('Leaves a future expiration un-noticed', () => {
      setup({ expiresAt: new Date(Date.now() + 60_000).toISOString() });
      expect(screen.queryByText(/has expired/)).not.toBeInTheDocument();
    });
  });

  describe('Destination selection', () => {
    test('Offers only a new patient when nothing matched', () => {
      setup();
      expect(screen.getByText('(No existing patient matches found)')).toBeInTheDocument();
      const options = screen.getAllByRole('radio');
      expect(options).toHaveLength(1);
      expect(within(options[0]).getByText('Create New Patient')).toBeInTheDocument();
    });

    test('Lists matches with their grade badges above the new patient option', () => {
      setup({
        matches: [
          { patient: CERTAIN_MATCH, score: 0.95, grade: 'certain' },
          { patient: POSSIBLE_MATCH, score: 0.6, grade: 'possible' },
        ],
        selectionValue: 'local-certain',
      });

      expect(screen.getByText('Import into an existing patient, or create a new one.')).toBeInTheDocument();
      const options = screen.getAllByRole('radio');
      expect(options).toHaveLength(3);
      expect(within(options[0]).getByText('Certain Match')).toBeInTheDocument();
      expect(within(options[1]).getByText('Possible Match')).toBeInTheDocument();
      expect(within(options[2]).getByText('Create New Patient')).toBeInTheDocument();
      expect(options[0]).toHaveAttribute('aria-checked', 'true');
      expect(options[1]).toHaveAttribute('aria-checked', 'false');
    });

    test('Labels a match without a birth date', () => {
      setup({ matches: [{ patient: POSSIBLE_MATCH, grade: 'possible' }] });
      expect(screen.getByText('No birth date')).toBeInTheDocument();
    });

    test('Reports the selected match', async () => {
      setup({ matches: [{ patient: CERTAIN_MATCH, grade: 'certain' }] });
      await userEvent.click(screen.getAllByRole('radio')[0]);
      expect(props.onSelectionChange).toHaveBeenCalledWith('local-certain');
    });

    test('Reports the new patient option', async () => {
      setup({ matches: [{ patient: CERTAIN_MATCH, grade: 'certain' }] });
      await userEvent.click(screen.getAllByRole('radio')[1]);
      expect(props.onSelectionChange).toHaveBeenCalledWith('new');
    });

    test('Marks the new patient option as checked', () => {
      setup({ selectionValue: 'new' });
      expect(screen.getAllByRole('radio')[0]).toHaveAttribute('aria-checked', 'true');
    });
  });

  describe('Continue', () => {
    test('Blocks continuing until a destination is chosen', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    test('Continues to the records step', async () => {
      setup({ canContinue: true });
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(props.onContinue).toHaveBeenCalledTimes(1);
    });
  });

  test('Renders nothing while the shared patient reference is unresolved', async () => {
    const readReference = vi.spyOn(medplum, 'readReference');
    setup({ sharedPatient: { reference: 'Patient/missing' } as Reference<Patient> });

    await waitFor(() => expect(readReference).toHaveBeenCalled());
    expect(screen.queryByText(/SMART Health Link Details/)).not.toBeInTheDocument();
  });
});
