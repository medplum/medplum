// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { BundleEntry, Patient, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SmartHealthLinkRecordsStepProps } from './SmartHealthLinkRecordsStep';
import { SmartHealthLinkRecordsStep } from './SmartHealthLinkRecordsStep';

const SHARED_PATIENT: Patient = {
  resourceType: 'Patient',
  id: 'shared-patient',
  name: [{ given: ['Homer'], family: 'Simpson' }],
  birthDate: '1956-05-12',
};

const LOCAL_PATIENT: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'local-patient',
  name: [{ given: ['Homer', 'J'], family: 'Simpson' }],
  birthDate: '1956-05-12',
};

const ENTRIES: BundleEntry[] = [
  {
    resource: {
      resourceType: 'AllergyIntolerance',
      id: 'allergy-1',
      patient: { reference: 'Patient/shared-patient' },
      code: { text: 'Peanuts' },
    },
  },
  {
    resource: {
      resourceType: 'Observation',
      id: 'observation-1',
      status: 'final',
      subject: { reference: 'Patient/shared-patient' },
      code: { text: 'Hemoglobin A1c' },
    },
  },
];

const ALL_KEYS = new Set(['AllergyIntolerance/allergy-1', 'Observation/observation-1']);

describe('SmartHealthLinkRecordsStep', () => {
  let medplum: MockClient;
  let props: SmartHealthLinkRecordsStepProps;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    props = {
      sharedPatient: SHARED_PATIENT,
      createNewPatient: false,
      selectedPatient: LOCAL_PATIENT,
      entries: ENTRIES,
      selectedKeys: ALL_KEYS,
      onToggleEntry: vi.fn(),
      onToggleAll: vi.fn(),
      allSelected: true,
      someSelected: false,
      importButtonLabel: 'Import Records to Homer J Simpson',
      importing: false,
      onImport: vi.fn(),
    };
  });

  function setup(overrides: Partial<SmartHealthLinkRecordsStepProps> = {}): ReturnType<typeof render> {
    props = { ...props, ...overrides };
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <SmartHealthLinkRecordsStep {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Lists each shared record with its friendly type label', () => {
    setup();
    expect(screen.getByText('Allergy')).toBeInTheDocument();
    expect(screen.getByText('Peanuts')).toBeInTheDocument();
    expect(screen.getByText('Observation')).toBeInTheDocument();
    expect(screen.getByText('Hemoglobin A1c')).toBeInTheDocument();
  });

  test('Names the existing destination patient and warns about exclusions', () => {
    setup();
    expect(screen.getByText('Select Records to Import to Existing Profile')).toBeInTheDocument();
    expect(screen.getByText('Existing records will automatically be excluded from the import.')).toBeInTheDocument();
    expect(screen.getByText('Homer J Simpson')).toBeInTheDocument();
  });

  test('Shows the shared patient as the destination when creating a new one', () => {
    setup({ createNewPatient: true, selectedPatient: undefined });
    expect(screen.getByText('Select Records to Import to New Profile')).toBeInTheDocument();
    expect(screen.getByText('Create New Patient')).toBeInTheDocument();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    // The dedupe notice only applies to an existing chart.
    expect(
      screen.queryByText('Existing records will automatically be excluded from the import.')
    ).not.toBeInTheDocument();
  });

  test('Counts the selected records', () => {
    setup({ selectedKeys: new Set(['Observation/observation-1']) });
    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();
  });

  test('Toggles a single record off', async () => {
    setup();
    await userEvent.click(screen.getByLabelText('Select Peanuts'));
    expect(props.onToggleEntry).toHaveBeenCalledWith('AllergyIntolerance/allergy-1', false);
  });

  test('Toggles a single record on', async () => {
    setup({ selectedKeys: new Set() });
    await userEvent.click(screen.getByLabelText('Select Peanuts'));
    expect(props.onToggleEntry).toHaveBeenCalledWith('AllergyIntolerance/allergy-1', true);
  });

  test('Toggles every record at once', async () => {
    setup({ allSelected: false, someSelected: false, selectedKeys: new Set() });
    await userEvent.click(screen.getByLabelText('Select all resources'));
    expect(props.onToggleAll).toHaveBeenCalledWith(true);
  });

  test('Clears every record at once', async () => {
    setup();
    expect(screen.getByLabelText('Select all resources')).toBeChecked();
    await userEvent.click(screen.getByLabelText('Select all resources'));
    expect(props.onToggleAll).toHaveBeenCalledWith(false);
  });

  test('Shows a partial selection as indeterminate rather than checked', () => {
    setup({ allSelected: false, someSelected: true, selectedKeys: new Set(['Observation/observation-1']) });
    const selectAll = screen.getByLabelText('Select all resources');
    expect(selectAll).not.toBeChecked();
    expect(selectAll).toHaveAttribute('data-indeterminate', 'true');
  });

  test('Imports the selected records', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Import Records to Homer J Simpson' }));
    expect(props.onImport).toHaveBeenCalledTimes(1);
  });

  test('Disables the import button when nothing is selected', () => {
    setup({ selectedKeys: new Set() });
    expect(screen.getByRole('button', { name: 'Import Records to Homer J Simpson' })).toBeDisabled();
  });

  test('Shows the import button as loading while importing', () => {
    const { container } = setup({ importing: true });
    expect(container.querySelector('[class*="mantine-Button-loader"]')).not.toBeNull();
  });

  test('Renders nothing without a destination patient', () => {
    setup({ createNewPatient: false, selectedPatient: undefined });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('Renders nothing while the shared patient reference is unresolved', async () => {
    const readReference = vi.spyOn(medplum, 'readReference');
    setup({
      createNewPatient: true,
      selectedPatient: undefined,
      sharedPatient: { reference: 'Patient/missing' } as Reference<Patient>,
    });

    await waitFor(() => expect(readReference).toHaveBeenCalled());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
