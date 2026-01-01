// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { HTTP_HL7_ORG } from '@medplum/core';
import type { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  test('creates a new condition with cholera ICD-10 code and active status', async () => {
    const user = userEvent.setup();
    const setConditions = vi.fn();
    const onDiagnosisChange = vi.fn();

    const newCondition: Condition & { id: string } = {
      resourceType: 'Condition',
      id: 'condition-new',
      subject: { reference: 'Patient/patient-123' },
      encounter: { reference: 'Encounter/encounter-123' },
      code: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'A00.9',
            display: 'Cholera, unspecified',
          },
        ],
      },
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: 'active',
            display: 'Active',
          },
        ],
      },
    };

    // Mock valueSetExpand for ICD-10 codes (cholera)
    medplum.valueSetExpand = vi
      .fn()
      .mockImplementation(async (params: { url: string; filter?: string; count?: number }) => {
        if (params.url === 'http://hl7.org/fhir/sid/icd-10-cm/vs') {
          const choleraCodes = [
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
          const filtered = params.filter
            ? choleraCodes.filter(
                (c) =>
                  c.code.toLowerCase().includes(params.filter?.toLowerCase() ?? '') ||
                  c.display.toLowerCase().includes(params.filter?.toLowerCase() ?? '')
              )
            : choleraCodes;
          const paginated = params.count ? filtered.slice(0, params.count) : filtered;
          return {
            resourceType: 'ValueSet',
            expansion: {
              total: filtered.length,
              timestamp: new Date().toISOString(),
              contains: paginated,
            },
          };
        }
        if (params.url === HTTP_HL7_ORG + '/fhir/ValueSet/condition-clinical') {
          const statuses = [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'active',
              display: 'Active',
            },
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'inactive',
              display: 'Inactive',
            },
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'resolved',
              display: 'Resolved',
            },
          ];
          const filtered = params.filter
            ? statuses.filter(
                (s) =>
                  s.code.toLowerCase().includes(params.filter?.toLowerCase() ?? '') ||
                  s.display.toLowerCase().includes(params.filter?.toLowerCase() ?? '')
              )
            : statuses;
          const paginated = params.count ? filtered.slice(0, params.count) : filtered;
          return {
            resourceType: 'ValueSet',
            expansion: {
              total: filtered.length,
              timestamp: new Date().toISOString(),
              contains: paginated,
            },
          };
        }
        return { resourceType: 'ValueSet', expansion: { contains: [] } };
      });

    vi.spyOn(medplum, 'createResource').mockResolvedValue(newCondition);

    setup({
      setConditions,
      onDiagnosisChange,
    });

    // Open modal
    await user.click(screen.getByRole('button', { name: 'Add Diagnosis' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Wait for form fields to be ready
    await waitFor(() => {
      expect(screen.getByText('ICD-10 Code')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    // Find ICD-10 code input by label
    await waitFor(() => {
      const inputs = screen.getAllByRole('searchbox');
      expect(inputs.length).toBeGreaterThan(0);
    });

    const icd10Inputs = screen.getAllByRole('searchbox');
    let icd10Input = icd10Inputs.find((input) => {
      const label = input.closest('.mantine-InputWrapper-root')?.querySelector('label');
      return label?.textContent?.includes('ICD-10 Code');
    });

    // Fallback to first input if label search doesn't work
    if (!icd10Input && icd10Inputs.length > 0) {
      icd10Input = icd10Inputs[0];
    }

    expect(icd10Input).toBeDefined();

    if (icd10Input) {
      // Type "cholera" to search
      await user.type(icd10Input, 'cholera');

      // Wait for valueSetExpand to be called with cholera filter
      await waitFor(
        () => {
          const calls = vi.mocked(medplum.valueSetExpand).mock.calls;
          const choleraCall = calls.find(
            (call) =>
              call[0]?.url === 'http://hl7.org/fhir/sid/icd-10-cm/vs' &&
              call[0]?.filter?.toLowerCase().includes('cholera')
          );
          expect(choleraCall).toBeDefined();
        },
        { timeout: 10000 }
      );

      // Select cholera option using keyboard navigation (select second option A00.9)
      await act(async () => {
        fireEvent.keyDown(icd10Input, { key: 'ArrowDown', code: 'ArrowDown' });
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            resolve();
          }, 100);
        });
        fireEvent.keyDown(icd10Input, { key: 'ArrowDown', code: 'ArrowDown' });
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            resolve();
          }, 100);
        });
        fireEvent.keyDown(icd10Input, { key: 'Enter', code: 'Enter' });
      });
    }

    // Find Status input
    await waitFor(() => {
      const inputs = screen.getAllByRole('searchbox');
      expect(inputs.length).toBeGreaterThan(1);
    });

    const statusInputs = screen.getAllByRole('searchbox');
    let statusInput = statusInputs.find((input) => {
      const label = input.closest('.mantine-InputWrapper-root')?.querySelector('label');
      return label?.textContent?.includes('Status');
    });

    // Fallback to second input if label search doesn't work
    if (!statusInput && statusInputs.length > 1) {
      statusInput = statusInputs[1];
    }

    expect(statusInput).toBeDefined();

    if (statusInput) {
      // Type "active" to search
      await user.type(statusInput, 'active');

      // Wait for valueSetExpand to be called with condition-clinical
      await waitFor(
        () => {
          const calls = vi.mocked(medplum.valueSetExpand).mock.calls;
          const clinicalStatusCall = calls.find(
            (call) => call[0]?.url === HTTP_HL7_ORG + '/fhir/ValueSet/condition-clinical'
          );
          expect(clinicalStatusCall).toBeDefined();
        },
        { timeout: 10000 }
      );

      // Select active status using keyboard navigation
      await act(async () => {
        fireEvent.keyDown(statusInput, { key: 'ArrowDown', code: 'ArrowDown' });
        await act(async () => {
          await new Promise<void>((resolve) => {
            setTimeout(() => {
              resolve();
            }, 100);
          });
        });
        fireEvent.keyDown(statusInput, { key: 'Enter', code: 'Enter' });
      });
    }

    // Submit form
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    // Wait for createResource to be called
    await waitFor(
      () => {
        expect(medplum.createResource).toHaveBeenCalled();
      },
      { timeout: 10000 }
    );

    // Verify the condition was created with correct values
    const createCall = vi.mocked(medplum.createResource).mock.calls[0][0] as Condition;
    expect(createCall.code?.coding?.[0]?.code).toBe('A00.9');
    expect(createCall.code?.coding?.[0]?.display).toBe('Cholera, unspecified');
    expect(createCall.clinicalStatus?.coding?.[0]?.code).toBe('active');

    // Verify setConditions and onDiagnosisChange were called
    await waitFor(
      () => {
        expect(setConditions).toHaveBeenCalled();
        expect(onDiagnosisChange).toHaveBeenCalled();
      },
      { timeout: 10000 }
    );
  }, 15000);
});
