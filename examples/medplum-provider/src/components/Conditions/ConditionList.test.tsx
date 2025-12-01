// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import type { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { ConditionList } from './ConditionList';

const mockPatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockEncounter: Encounter = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    code: 'AMB',
  },
  subject: { reference: 'Patient/patient-123' },
  diagnosis: [
    {
      condition: { reference: 'Condition/condition-123' },
      rank: 1,
    },
  ],
};

const mockCondition: Condition = {
  resourceType: 'Condition',
  id: 'condition-123',
  subject: { reference: 'Patient/patient-123' },
  code: {
    coding: [
      {
        system: 'http://hl7.org/fhir/sid/icd-10-cm',
        code: 'J20.9',
        display: 'Acute bronchitis',
      },
    ],
  },
  clinicalStatus: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
        code: 'active',
      },
    ],
  },
};

describe('ConditionList', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (props: Partial<Parameters<typeof ConditionList>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <ConditionList
            patient={mockPatient}
            encounter={mockEncounter}
            conditions={[]}
            setConditions={vi.fn()}
            onDiagnosisChange={vi.fn()}
            {...props}
          />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  test('renders diagnosis section', () => {
    setup();
    expect(screen.getByText('Diagnosis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Diagnosis' })).toBeInTheDocument();
  });

  test('renders condition list', () => {
    setup({ conditions: [mockCondition] });
    expect(screen.getByText('Acute bronchitis')).toBeInTheDocument();
  });

  test('renders multiple conditions with ranks', () => {
    const condition2: Condition = {
      ...mockCondition,
      id: 'condition-456',
      code: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'I10',
            display: 'Essential hypertension',
          },
        ],
      },
    };

    setup({ conditions: [mockCondition, condition2] });

    expect(screen.getByText('Acute bronchitis')).toBeInTheDocument();
    expect(screen.getByText('Essential hypertension')).toBeInTheDocument();
  });

  test('opens add diagnosis modal', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: 'Add Diagnosis' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Add Diagnosis', { selector: '.mantine-Modal-title' })).toBeInTheDocument();
    });
  });

  test('displays modal form fields', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: 'Add Diagnosis' }));

    await waitFor(() => {
      expect(screen.getByText('ICD-10 Code')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });
  });

  test('removes condition', async () => {
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    const user = userEvent.setup();

    vi.spyOn(medplum, 'deleteResource').mockResolvedValue({} as any);

    setup({
      conditions: [mockCondition],
      setConditions,
      onDiagnosisChange,
    });

    const removeButtons = screen.getAllByRole('button', { hidden: true });
    const removeButton = removeButtons.find((btn) => btn.querySelector('svg'));

    if (!removeButton) {
      throw new Error('Remove button not found');
    }

    await user.click(removeButton);

    await waitFor(() => {
      expect(medplum.deleteResource).toHaveBeenCalledWith('Condition', 'condition-123');
      expect(setConditions).toHaveBeenCalledWith([]);
      expect(onDiagnosisChange).toHaveBeenCalled();
    });
  });

  test('displays rank selects for multiple conditions', () => {
    const condition2: Condition = {
      ...mockCondition,
      id: 'condition-456',
      code: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'I10',
            display: 'Essential hypertension',
          },
        ],
      },
    };

    setup({
      conditions: [mockCondition, condition2],
    });

    const selects = screen.getAllByRole('textbox');
    expect(selects).toHaveLength(2);
    expect(selects[0]).toHaveValue('1');
    expect(selects[1]).toHaveValue('2');
  });

  test('fetches conditions on mount', async () => {
    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockCondition as any);

    const setConditions = vi.fn();

    setup({
      encounter: mockEncounter,
      setConditions,
    });

    await waitFor(() => {
      expect(medplum.readReference).toHaveBeenCalledWith({ reference: 'Condition/condition-123' });
    });
  });
});
