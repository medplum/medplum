// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { HTTP_HL7_ORG, sleep } from '@medplum/core';
import type { Condition, Encounter, Patient, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ConditionList } from './ConditionList';

const mockPatient: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockEncounter: WithId<Encounter> = {
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

const mockCondition: WithId<Condition> = {
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
};

const hypertension: WithId<Condition> = {
  ...mockCondition,
  id: 'condition-456',
  code: { coding: [{ code: 'I10', display: 'Essential hypertension' }] },
};

const diabetes: WithId<Condition> = {
  ...mockCondition,
  id: 'condition-789',
  code: { coding: [{ code: 'E11.9', display: 'Type 2 diabetes mellitus' }] },
};

const expansions: Record<string, ValueSetExpansionContains[]> = {
  'http://hl7.org/fhir/sid/icd-10-cm/vs/billable': [{ code: 'A00.9', display: 'Cholera, unspecified' }],
  [HTTP_HL7_ORG + '/fhir/ValueSet/condition-clinical']: [{ code: 'active', display: 'Active' }],
};

function mockValueSetExpand(medplum: MockClient): void {
  medplum.valueSetExpand = vi.fn().mockImplementation(async (params: { url: string }) => ({
    resourceType: 'ValueSet',
    expansion: { contains: expansions[params.url] ?? [] },
  }));
}

async function submitCholeraDiagnosis(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Add Diagnosis' }));
  await user.type(await screen.findByRole('searchbox', { name: 'ICD-10 Code' }), 'cholera');
  await user.click(await screen.findByText('Cholera, unspecified'));
  await user.type(await screen.findByRole('searchbox', { name: 'Status' }), 'active');
  await user.click(await screen.findByText('Active'));
  await user.click(screen.getByRole('button', { name: 'Save' }));
}

/**
 * Every rank Select portals its own dropdown, so the option is scoped to the one this input controls.
 * @param user - The user-event session.
 * @param select - The Select input to open.
 * @param rank - The option label to choose.
 */
async function selectRank(user: UserEvent, select: HTMLElement, rank: string): Promise<void> {
  await user.click(select);
  const dropdownId = select.getAttribute('aria-controls');
  const dropdown = dropdownId ? document.getElementById(dropdownId) : null;
  const scope = dropdown ? within(dropdown) : screen;
  await user.click(await scope.findByRole('option', { name: rank, hidden: true }));
}

function findRemoveButtons(): HTMLElement[] {
  return screen.getAllByRole('button', { hidden: true }).filter((btn) => btn.querySelector('svg'));
}

describe('ConditionList', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    notifications.clean();
  });

  const setup = (props: Partial<Parameters<typeof ConditionList>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Notifications />
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
    setup({ conditions: [mockCondition, hypertension] });

    expect(screen.getByText('Acute bronchitis')).toBeInTheDocument();
    expect(screen.getByText('Essential hypertension')).toBeInTheDocument();
  });

  test('opens add diagnosis modal and closes it on escape', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: 'Add Diagnosis' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Add Diagnosis', { selector: '.mantine-Modal-title' })).toBeInTheDocument();
    });

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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

    vi.spyOn(medplum, 'deleteResource').mockResolvedValue({});

    setup({
      conditions: [mockCondition],
      setConditions,
      onDiagnosisChange,
    });

    await user.click(findRemoveButtons()[0]);

    await waitFor(() => {
      expect(medplum.deleteResource).toHaveBeenCalledWith('Condition', 'condition-123');
      expect(setConditions).toHaveBeenCalledWith([]);
      expect(onDiagnosisChange).toHaveBeenCalledWith([]);
    });
  });

  test('reindexes remaining diagnosis ranks after removing a condition', async () => {
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    vi.spyOn(medplum, 'deleteResource').mockResolvedValue({});
    const conditions = [mockCondition, hypertension, diabetes];
    const diagnosis = conditions.map((c, i) => ({ condition: { reference: `Condition/${c.id}` }, rank: i + 1 }));
    setup({ encounter: { ...mockEncounter, diagnosis }, conditions, setConditions, onDiagnosisChange });
    await userEvent.setup().click(findRemoveButtons()[0]);
    await waitFor(() => expect(setConditions).toHaveBeenCalledWith([hypertension, diabetes]));
    expect(onDiagnosisChange).toHaveBeenCalledWith([diagnosis[1], diagnosis[2]].map((d, i) => ({ ...d, rank: i + 1 })));
  });

  test('shows an error notification when deleting a condition fails', async () => {
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    vi.spyOn(medplum, 'deleteResource').mockRejectedValue(new Error('Delete failed'));
    setup({ conditions: [mockCondition], setConditions, onDiagnosisChange });
    await userEvent.setup().click(findRemoveButtons()[0]);
    expect(await screen.findByText('Delete failed')).toBeInTheDocument();
    expect(setConditions).not.toHaveBeenCalled();
    expect(onDiagnosisChange).not.toHaveBeenCalled();
  });

  test('displays rank selects for multiple conditions', () => {
    setup({ conditions: [mockCondition, hypertension] });

    const selects = screen.getAllByRole('textbox');
    expect(selects).toHaveLength(2);
    expect(selects[0]).toHaveValue('1');
    expect(selects[1]).toHaveValue('2');
  });

  test.each([
    ['moves the first condition down to rank 3', 0, '3', [hypertension, diabetes, mockCondition]],
    ['moves the last condition up to rank 1', 2, '1', [diabetes, mockCondition, hypertension]],
  ])('%s and renumbers the diagnosis list', async (_name, index, rank, expected) => {
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    setup({ conditions: [mockCondition, hypertension, diabetes], setConditions, onDiagnosisChange });

    await selectRank(userEvent.setup(), screen.getAllByRole('textbox')[index], rank);

    expect(setConditions).toHaveBeenCalledWith(expected);
    expect(onDiagnosisChange).toHaveBeenCalledWith(
      expected.map((c, i) => ({ condition: { reference: `Condition/${c.id}` }, rank: i + 1 }))
    );
  });

  test('does not reorder when the encounter is missing', async () => {
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    const encounter = undefined as unknown as Encounter;
    setup({ encounter, conditions: [mockCondition, hypertension], setConditions, onDiagnosisChange });
    await selectRank(userEvent.setup(), screen.getAllByRole('textbox')[0], '2');
    expect(setConditions).not.toHaveBeenCalled();
    expect(onDiagnosisChange).not.toHaveBeenCalled();
  });

  test('fetches conditions on mount', async () => {
    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockCondition);

    const setConditions = vi.fn();

    setup({ setConditions });

    await waitFor(() => {
      expect(medplum.readReference).toHaveBeenCalledWith({ reference: 'Condition/condition-123' });
    });
    await waitFor(() => {
      expect(setConditions).toHaveBeenCalledWith([mockCondition]);
    });
  });

  test('does not fetch conditions when the encounter is missing', async () => {
    const readReference = vi.spyOn(medplum, 'readReference');
    const show = vi.spyOn(notifications, 'show');
    const setConditions = vi.fn();
    setup({ encounter: undefined as unknown as Encounter, setConditions });
    expect(screen.getByText('Diagnosis')).toBeInTheDocument();
    await act(() => sleep(0));
    expect(readReference).not.toHaveBeenCalled();
    expect(setConditions).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  test('falls back to diagnosis position for a missing rank and skips diagnoses without a reference', async () => {
    await Promise.all([mockCondition, hypertension].map((c) => medplum.createResource(c)));
    const setConditions = vi.fn();
    const diagnosis = [
      { condition: { reference: 'Condition/condition-456' }, rank: 2 },
      { condition: { reference: 'Condition/condition-123' } },
      { condition: { display: 'Unlinked' } },
    ];
    setup({ encounter: { ...mockEncounter, diagnosis }, setConditions });

    await waitFor(() => {
      expect(setConditions).toHaveBeenCalled();
    });
    expect(setConditions.mock.calls[0][0].map((c: Condition) => c.id)).toEqual(['condition-123', 'condition-456']);
  });

  test('shows an error notification when fetching conditions fails', async () => {
    vi.spyOn(medplum, 'readReference').mockRejectedValue(new Error('Condition not found'));
    const setConditions = vi.fn();

    setup({ setConditions });

    expect(await screen.findByText('Condition not found')).toBeInTheDocument();
    expect(setConditions).not.toHaveBeenCalled();
  });

  test('creates a new condition with cholera ICD-10 code and active status', async () => {
    const user = userEvent.setup();
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    const newCondition: WithId<Condition> = { ...mockCondition, id: 'condition-new' };
    mockValueSetExpand(medplum);
    vi.spyOn(medplum, 'createResource').mockResolvedValue(newCondition);
    setup({ conditions: [mockCondition], setConditions, onDiagnosisChange });
    await submitCholeraDiagnosis(user);

    await waitFor(
      () => {
        expect(medplum.createResource).toHaveBeenCalled();
      },
      { timeout: 10000 }
    );

    const createCall = vi.mocked(medplum.createResource).mock.calls[0][0] as Condition;
    expect(createCall.code?.coding?.[0]?.code).toBe('A00.9');
    expect(createCall.code?.coding?.[0]?.display).toBe('Cholera, unspecified');
    expect(createCall.clinicalStatus?.coding?.[0]?.code).toBe('active');

    await waitFor(() => {
      expect(setConditions).toHaveBeenCalledWith([mockCondition, newCondition]);
      expect(onDiagnosisChange).toHaveBeenCalledWith([
        { condition: { reference: 'Condition/condition-123' }, rank: 1 },
        { condition: { reference: 'Condition/condition-new' }, rank: 2 },
      ]);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  }, 15000);

  test('shows an error notification and closes the modal when creating a condition fails', async () => {
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    mockValueSetExpand(medplum);
    vi.spyOn(medplum, 'createResource').mockRejectedValue(new Error('Create failed'));
    setup({ setConditions, onDiagnosisChange });
    await submitCholeraDiagnosis(userEvent.setup());
    expect(await screen.findByText('Create failed', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(setConditions).not.toHaveBeenCalled();
    expect(onDiagnosisChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  }, 15000);
});
