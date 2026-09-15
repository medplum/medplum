// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { HTTP_HL7_ORG, ReadablePromise } from '@medplum/core';
import type { Condition, Encounter, Patient, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  clinicalStatus: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
        code: 'active',
      },
    ],
  },
};

const hypertension: WithId<Condition> = {
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

const diabetes: WithId<Condition> = {
  ...mockCondition,
  id: 'condition-789',
  code: {
    coding: [
      {
        system: 'http://hl7.org/fhir/sid/icd-10-cm',
        code: 'E11.9',
        display: 'Type 2 diabetes mellitus',
      },
    ],
  },
};

const choleraCodes: ValueSetExpansionContains[] = [
  {
    system: 'http://hl7.org/fhir/sid/icd-10-cm',
    code: 'A00.0',
    display: 'Cholera due to Vibrio cholerae 01, biovar cholerae',
  },
  {
    system: 'http://hl7.org/fhir/sid/icd-10-cm',
    code: 'A00.9',
    display: 'Cholera, unspecified',
  },
];

const clinicalStatusCodes: ValueSetExpansionContains[] = [
  { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active', display: 'Active' },
  { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'inactive', display: 'Inactive' },
  { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'resolved', display: 'Resolved' },
];

/**
 * Stands in for the terminology server: answers the ICD-10 billable and condition-clinical
 * bindings used by ConditionModal with a small, filterable expansion.
 * @param medplum - The mock client whose valueSetExpand is replaced.
 */
function mockValueSetExpand(medplum: MockClient): void {
  medplum.valueSetExpand = vi
    .fn()
    .mockImplementation(async (params: { url: string; filter?: string; count?: number }) => {
      let codes: ValueSetExpansionContains[] = [];
      if (params.url === 'http://hl7.org/fhir/sid/icd-10-cm/vs/billable') {
        codes = choleraCodes;
      } else if (params.url === HTTP_HL7_ORG + '/fhir/ValueSet/condition-clinical') {
        codes = clinicalStatusCodes;
      }
      const filter = params.filter?.toLowerCase() ?? '';
      const filtered = filter
        ? codes.filter((c) => c.code?.toLowerCase().includes(filter) || c.display?.toLowerCase().includes(filter))
        : codes;
      const paginated = params.count ? filtered.slice(0, params.count) : filtered;
      return {
        resourceType: 'ValueSet',
        expansion: { total: filtered.length, timestamp: new Date().toISOString(), contains: paginated },
      };
    });
}

function findSearchbox(labelText: string): HTMLElement {
  const inputs = screen.getAllByRole('searchbox');
  const match = inputs.find((input) =>
    input.closest('.mantine-InputWrapper-root')?.querySelector('label')?.textContent?.includes(labelText)
  );
  return match ?? inputs[0];
}

async function pressKeys(input: HTMLElement, keys: string[]): Promise<void> {
  await act(async () => {
    for (const key of keys) {
      fireEvent.keyDown(input, { key, code: key });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
    }
  });
}

/**
 * Drives the Add Diagnosis modal end to end: picks "Cholera, unspecified" as the ICD-10
 * code and "Active" as the clinical status, then presses Save.
 * @param user - The user-event session.
 * @param medplum - The mock client whose valueSetExpand calls are awaited.
 */
async function submitCholeraDiagnosis(user: UserEvent, medplum: MockClient): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Add Diagnosis' }));
  await screen.findByRole('dialog');
  await screen.findByText('ICD-10 Code');
  await waitFor(() => {
    expect(screen.getAllByRole('searchbox').length).toBeGreaterThan(0);
  });

  const icd10Input = findSearchbox('ICD-10 Code');
  await user.type(icd10Input, 'cholera');
  await waitFor(
    () => {
      const calls = vi.mocked(medplum.valueSetExpand).mock.calls;
      expect(
        calls.some(
          (call) =>
            call[0]?.url === 'http://hl7.org/fhir/sid/icd-10-cm/vs/billable' &&
            call[0]?.filter?.toLowerCase().includes('cholera')
        )
      ).toBe(true);
    },
    { timeout: 10000 }
  );
  await pressKeys(icd10Input, ['ArrowDown', 'ArrowDown', 'Enter']);

  await waitFor(() => {
    expect(screen.getAllByRole('searchbox').length).toBeGreaterThan(0);
  });
  const statusInput = findSearchbox('Status');
  await user.type(statusInput, 'active');
  await waitFor(
    () => {
      const calls = vi.mocked(medplum.valueSetExpand).mock.calls;
      expect(calls.some((call) => call[0]?.url === HTTP_HL7_ORG + '/fhir/ValueSet/condition-clinical')).toBe(true);
    },
    { timeout: 10000 }
  );
  await pressKeys(statusInput, ['ArrowDown', 'Enter']);

  await user.click(screen.getByRole('button', { name: 'Save' }));
}

/**
 * Opens one rank Select and picks an option from its own dropdown; every row renders a
 * dropdown into a portal, so options must be scoped to the one the input controls.
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

  test('renders no condition rows when conditions is undefined', () => {
    setup({ conditions: undefined });

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Add Diagnosis' })).toBeInTheDocument();
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

  test('closes the add diagnosis modal on escape', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: 'Add Diagnosis' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    const user = userEvent.setup();
    vi.spyOn(medplum, 'deleteResource').mockResolvedValue({});

    const encounter: WithId<Encounter> = {
      ...mockEncounter,
      diagnosis: [
        { condition: { reference: 'Condition/condition-123' }, rank: 1 },
        { condition: { reference: 'Condition/condition-456' }, rank: 2 },
        { condition: { reference: 'Condition/condition-789' }, rank: 3 },
      ],
    };

    setup({
      encounter,
      conditions: [mockCondition, hypertension, diabetes],
      setConditions,
      onDiagnosisChange,
    });

    await user.click(findRemoveButtons()[0]);

    await waitFor(() => {
      expect(medplum.deleteResource).toHaveBeenCalledWith('Condition', 'condition-123');
    });
    expect(setConditions).toHaveBeenCalledWith([hypertension, diabetes]);
    expect(onDiagnosisChange).toHaveBeenCalledWith([
      { condition: { reference: 'Condition/condition-456' }, rank: 1 },
      { condition: { reference: 'Condition/condition-789' }, rank: 2 },
    ]);
  });

  test('shows an error notification when deleting a condition fails', async () => {
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    const user = userEvent.setup();
    vi.spyOn(medplum, 'deleteResource').mockRejectedValue(new Error('Delete failed'));

    setup({ conditions: [mockCondition], setConditions, onDiagnosisChange });

    await user.click(findRemoveButtons()[0]);

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

  test('moves a condition to the selected rank and renumbers the diagnosis list', async () => {
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    const user = userEvent.setup();

    setup({
      conditions: [mockCondition, hypertension, diabetes],
      setConditions,
      onDiagnosisChange,
    });

    await selectRank(user, screen.getAllByRole('textbox')[0], '3');

    expect(setConditions).toHaveBeenCalledWith([hypertension, diabetes, mockCondition]);
    expect(onDiagnosisChange).toHaveBeenCalledWith([
      { condition: { reference: 'Condition/condition-456' }, rank: 1 },
      { condition: { reference: 'Condition/condition-789' }, rank: 2 },
      { condition: { reference: 'Condition/condition-123' }, rank: 3 },
    ]);
  });

  test('moves a lower ranked condition up to the first position', async () => {
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    const user = userEvent.setup();

    setup({ conditions: [mockCondition, hypertension, diabetes], setConditions, onDiagnosisChange });

    await selectRank(user, screen.getAllByRole('textbox')[2], '1');

    expect(setConditions).toHaveBeenCalledWith([diabetes, mockCondition, hypertension]);
    expect(onDiagnosisChange).toHaveBeenCalledWith([
      { condition: { reference: 'Condition/condition-789' }, rank: 1 },
      { condition: { reference: 'Condition/condition-123' }, rank: 2 },
      { condition: { reference: 'Condition/condition-456' }, rank: 3 },
    ]);
  });

  test('does not reorder when the encounter is missing', async () => {
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    const user = userEvent.setup();

    setup({
      encounter: undefined as unknown as Encounter,
      conditions: [mockCondition, hypertension],
      setConditions,
      onDiagnosisChange,
    });

    await selectRank(user, screen.getAllByRole('textbox')[0], '2');

    expect(setConditions).not.toHaveBeenCalled();
    expect(onDiagnosisChange).not.toHaveBeenCalled();
  });

  test('fetches conditions on mount', async () => {
    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockCondition);

    const setConditions = vi.fn();

    setup({
      encounter: mockEncounter,
      setConditions,
    });

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
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(readReference).not.toHaveBeenCalled();
    expect(setConditions).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  test('does not set conditions when the encounter has no diagnosis', async () => {
    const readReference = vi.spyOn(medplum, 'readReference');
    const setConditions = vi.fn();

    setup({ encounter: { ...mockEncounter, diagnosis: undefined }, setConditions });

    await waitFor(() => {
      expect(readReference).not.toHaveBeenCalled();
    });
    expect(setConditions).not.toHaveBeenCalled();
  });

  test('orders fetched conditions by diagnosis rank', async () => {
    const conditionsByRef: Record<string, WithId<Condition>> = {
      'Condition/condition-123': mockCondition,
      'Condition/condition-456': hypertension,
      'Condition/condition-789': diabetes,
    };
    vi.spyOn(medplum, 'readReference').mockImplementation(
      (ref) => new ReadablePromise(Promise.resolve(conditionsByRef[ref.reference ?? '']))
    );
    const setConditions = vi.fn();

    const encounter: WithId<Encounter> = {
      ...mockEncounter,
      diagnosis: [
        { condition: { reference: 'Condition/condition-123' }, rank: 3 },
        { condition: { reference: 'Condition/condition-456' }, rank: 1 },
        { condition: { reference: 'Condition/condition-789' }, rank: 2 },
      ],
    };

    setup({ encounter, setConditions });

    await waitFor(() => {
      expect(setConditions).toHaveBeenCalledWith([hypertension, diabetes, mockCondition]);
    });
  });

  test('falls back to diagnosis position when a rank is missing', async () => {
    const conditionsByRef: Record<string, WithId<Condition>> = {
      'Condition/condition-123': mockCondition,
      'Condition/condition-456': hypertension,
    };
    vi.spyOn(medplum, 'readReference').mockImplementation(
      (ref) => new ReadablePromise(Promise.resolve(conditionsByRef[ref.reference ?? '']))
    );
    const setConditions = vi.fn();

    const encounter: WithId<Encounter> = {
      ...mockEncounter,
      diagnosis: [
        { condition: { reference: 'Condition/condition-456' }, rank: 2 },
        { condition: { reference: 'Condition/condition-123' } },
      ],
    };

    setup({ encounter, setConditions });

    await waitFor(() => {
      expect(setConditions).toHaveBeenCalledWith([mockCondition, hypertension]);
    });
  });

  test('drops fetched conditions that are not referenced by the encounter diagnosis', async () => {
    vi.spyOn(medplum, 'readReference').mockResolvedValue(diabetes);
    const setConditions = vi.fn();

    const encounter: WithId<Encounter> = {
      ...mockEncounter,
      diagnosis: [
        { condition: { reference: 'Condition/condition-123' }, rank: 1 },
        { condition: { display: 'Unlinked' } },
      ],
    };

    setup({ encounter, setConditions });

    await waitFor(() => {
      expect(setConditions).toHaveBeenCalledWith([]);
    });
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

    const newCondition: WithId<Condition> = {
      resourceType: 'Condition',
      id: 'condition-new',
      subject: { reference: 'Patient/patient-123' },
      encounter: { reference: 'Encounter/encounter-123' },
      code: { coding: [choleraCodes[1]] },
      clinicalStatus: { coding: [clinicalStatusCodes[0]] },
    };

    mockValueSetExpand(medplum);
    vi.spyOn(medplum, 'createResource').mockResolvedValue(newCondition);

    setup({ conditions: [mockCondition], setConditions, onDiagnosisChange });

    await submitCholeraDiagnosis(user, medplum);

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

    await waitFor(
      () => {
        expect(setConditions).toHaveBeenCalledWith([mockCondition, newCondition]);
        expect(onDiagnosisChange).toHaveBeenCalledWith([
          { condition: { reference: 'Condition/condition-123' }, rank: 1 },
          { condition: { reference: 'Condition/condition-new' }, rank: 2 },
        ]);
      },
      { timeout: 10000 }
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  }, 15000);

  test('starts the diagnosis list at rank 1 when the encounter has none', async () => {
    const user = userEvent.setup();
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();
    const newCondition: WithId<Condition> = { ...mockCondition, id: 'condition-new' };

    mockValueSetExpand(medplum);
    vi.spyOn(medplum, 'createResource').mockResolvedValue(newCondition);

    setup({
      encounter: { ...mockEncounter, diagnosis: undefined },
      conditions: undefined,
      setConditions,
      onDiagnosisChange,
    });

    await submitCholeraDiagnosis(user, medplum);

    await waitFor(
      () => {
        expect(setConditions).toHaveBeenCalledWith([newCondition]);
        expect(onDiagnosisChange).toHaveBeenCalledWith([
          { condition: { reference: 'Condition/condition-new' }, rank: 1 },
        ]);
      },
      { timeout: 10000 }
    );
  }, 15000);

  test('shows an error notification and closes the modal when creating a condition fails', async () => {
    const user = userEvent.setup();
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();

    mockValueSetExpand(medplum);
    vi.spyOn(medplum, 'createResource').mockRejectedValue(new Error('Create failed'));

    setup({ setConditions, onDiagnosisChange });

    await submitCholeraDiagnosis(user, medplum);

    expect(await screen.findByText('Create failed', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(setConditions).not.toHaveBeenCalled();
    expect(onDiagnosisChange).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  }, 15000);
});
