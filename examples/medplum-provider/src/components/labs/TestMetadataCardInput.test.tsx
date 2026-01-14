// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { LabOrderInputErrors, TestCoding } from '@medplum/health-gorilla-core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { TestMetadataCardInput } from './TestMetadataCardInput';
import { useHealthGorillaLabOrder, HealthGorillaLabOrderProvider } from '@medplum/health-gorilla-react';
import type { TestMetadata } from '@medplum/health-gorilla-react';
import type { Questionnaire } from '@medplum/fhirtypes';

vi.mock('@medplum/health-gorilla-react', async () => {
  const actual = await vi.importActual('@medplum/health-gorilla-react');
  return {
    ...actual,
    useHealthGorillaLabOrder: vi.fn(),
  };
});

const mockTest: TestCoding = {
  code: 'TEST001',
  display: 'Complete Blood Count',
  system: 'http://loinc.org',
};

const mockQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'AOE Questionnaire',
  item: [
    {
      linkId: 'q1',
      text: 'Question 1',
      type: 'string',
    },
  ],
};

function createMockMetadata(overrides?: Partial<TestMetadata>): TestMetadata {
  return {
    priority: 'routine',
    notes: undefined,
    aoeStatus: 'none',
    aoeQuestionnaire: undefined,
    aoeResponses: undefined,
    ...overrides,
  };
}

describe('TestMetadataCardInput', () => {
  let medplum: MockClient;
  let mockUpdateTestMetadata: ReturnType<typeof vi.fn>;
  let mockLabOrderReturn: ReturnType<typeof useHealthGorillaLabOrder>;

  beforeEach(() => {
    vi.clearAllMocks();
    medplum = new MockClient();

    mockUpdateTestMetadata = vi.fn();

    mockLabOrderReturn = {
      state: {
        performingLab: undefined,
        performingLabAccountNumber: undefined,
        selectedTests: [],
        testMetadata: {},
        diagnoses: [],
        billingInformation: {
          billTo: 'insurance',
        },
        specimenCollectedDateTime: undefined,
        orderNotes: undefined,
      },
      removeDiagnosis: vi.fn(),
      setDiagnoses: vi.fn(),
      getActivePatientCoverages: vi.fn().mockResolvedValue([]),
      updateBillingInformation: vi.fn(),
      setSpecimenCollectedDateTime: vi.fn(),
      setOrderNotes: vi.fn(),
      validateOrder: vi.fn().mockReturnValue(undefined),
      createOrderBundle: vi.fn(),
      searchAvailableLabs: vi.fn().mockResolvedValue([]),
      searchAvailableTests: vi.fn().mockResolvedValue([]),
      setPerformingLab: vi.fn(),
      setPerformingLabAccountNumber: vi.fn(),
      addTest: vi.fn(),
      removeTest: vi.fn(),
      setTests: vi.fn(),
      updateTestMetadata: mockUpdateTestMetadata,
      addDiagnosis: vi.fn(),
    } as any;

    vi.mocked(useHealthGorillaLabOrder).mockReturnValue(mockLabOrderReturn);
  });

  function setup(
    props: {
      test?: TestCoding;
      metadata?: TestMetadata | undefined;
      error?: NonNullable<LabOrderInputErrors['testMetadata']>[keyof NonNullable<LabOrderInputErrors['testMetadata']>];
    } = {}
  ): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <HealthGorillaLabOrderProvider {...mockLabOrderReturn}>
              <TestMetadataCardInput test={props.test || mockTest} metadata={props.metadata} error={props.error} />
            </HealthGorillaLabOrderProvider>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders "Missing metadata" when metadata is undefined', () => {
    setup({ metadata: undefined });

    expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
    expect(screen.getByText('Missing metadata')).toBeInTheDocument();
    expect(screen.queryByLabelText('Priority')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument();
  });

  test('Renders form fields when metadata exists', () => {
    const metadata = createMockMetadata();
    setup({ metadata });

    expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
    expect(screen.queryByText('Missing metadata')).not.toBeInTheDocument();
  });

  test('Renders all priority radio options', () => {
    const metadata = createMockMetadata({ priority: 'routine' });
    setup({ metadata });

    expect(screen.getByLabelText('Routine')).toBeInTheDocument();
    expect(screen.getByLabelText('Urgent')).toBeInTheDocument();
    expect(screen.getByLabelText('ASAP')).toBeInTheDocument();
    expect(screen.getByLabelText('Stat')).toBeInTheDocument();
  });

  test('Selects correct priority radio option', () => {
    const metadata = createMockMetadata({ priority: 'urgent' });
    setup({ metadata });

    const urgentRadio = screen.getByLabelText('Urgent');
    expect(urgentRadio).toBeChecked();
  });

  test('Calls updateTestMetadata when priority changes', async () => {
    const user = userEvent.setup();
    const metadata = createMockMetadata({ priority: 'routine' });
    setup({ metadata });

    const urgentRadio = screen.getByLabelText('Urgent');
    await act(async () => {
      await user.click(urgentRadio);
    });

    expect(mockUpdateTestMetadata).toHaveBeenCalledWith(mockTest, { priority: 'urgent' });
  });

  test('Calls updateTestMetadata when priority changes to asap', async () => {
    const user = userEvent.setup();
    const metadata = createMockMetadata({ priority: 'routine' });
    setup({ metadata });

    const asapRadio = screen.getByLabelText('ASAP');
    await act(async () => {
      await user.click(asapRadio);
    });

    expect(mockUpdateTestMetadata).toHaveBeenCalledWith(mockTest, { priority: 'asap' });
  });

  test('Calls updateTestMetadata when priority changes to stat', async () => {
    const user = userEvent.setup();
    const metadata = createMockMetadata({ priority: 'routine' });
    setup({ metadata });

    const statRadio = screen.getByLabelText('Stat');
    await act(async () => {
      await user.click(statRadio);
    });

    expect(mockUpdateTestMetadata).toHaveBeenCalledWith(mockTest, { priority: 'stat' });
  });

  test('Displays notes value in TextInput', () => {
    const metadata = createMockMetadata({ notes: 'Test notes here' });
    setup({ metadata });

    const notesInput = screen.getByLabelText<HTMLInputElement>('Notes');
    expect(notesInput.value).toBe('Test notes here');
  });

  test('Displays empty string when notes is undefined', () => {
    const metadata = createMockMetadata({ notes: undefined });
    setup({ metadata });

    const notesInput = screen.getByLabelText<HTMLInputElement>('Notes');
    expect(notesInput.value).toBe('');
  });

  test('Calls updateTestMetadata when notes change', async () => {
    const metadata = createMockMetadata({ notes: '' });
    setup({ metadata });

    const notesInput = screen.getByLabelText('Notes');
    await act(async () => {
      fireEvent.change(notesInput, { target: { value: 'Test note' } });
    });

    expect(mockUpdateTestMetadata).toHaveBeenCalledWith(mockTest, { notes: 'Test note' });
  });

  test('Shows "Loading AoE..." when aoeStatus is loading', () => {
    const metadata = createMockMetadata({ aoeStatus: 'loading' });
    setup({ metadata });

    expect(screen.getByText('Loading AoE...')).toBeInTheDocument();
  });

  test('Renders QuestionnaireForm when aoeStatus is loaded and questionnaire exists', async () => {
    const metadata = createMockMetadata({
      aoeStatus: 'loaded',
      aoeQuestionnaire: mockQuestionnaire,
    });
    setup({ metadata });

    await waitFor(() => {
      expect(screen.getByText('Question 1')).toBeInTheDocument();
    });
  });

  test('Does not render QuestionnaireForm when aoeStatus is loaded but questionnaire is undefined', () => {
    const metadata = createMockMetadata({
      aoeStatus: 'loaded',
      aoeQuestionnaire: undefined,
    });
    setup({ metadata });

    expect(screen.queryByText('Question 1')).not.toBeInTheDocument();
  });

  test('Displays error message for priority', () => {
    const error: NonNullable<LabOrderInputErrors['testMetadata']>[keyof NonNullable<
      LabOrderInputErrors['testMetadata']
    >] = {
      priority: { message: 'Priority is required' },
    };
    const metadata = createMockMetadata();
    setup({ metadata, error });

    expect(screen.getByText('Priority is required')).toBeInTheDocument();
  });

  test('Displays error message for aoeResponses', () => {
    const error: NonNullable<LabOrderInputErrors['testMetadata']>[keyof NonNullable<
      LabOrderInputErrors['testMetadata']
    >] = {
      aoeResponses: { message: 'AOE responses are invalid' },
    };
    const metadata = createMockMetadata({
      aoeStatus: 'loaded',
      aoeQuestionnaire: mockQuestionnaire,
    });
    setup({ metadata, error });

    expect(screen.getByText('AOE responses are invalid')).toBeInTheDocument();
  });

  test('Calls updateTestMetadata when questionnaire response changes', async () => {
    const metadata = createMockMetadata({
      aoeStatus: 'loaded',
      aoeQuestionnaire: mockQuestionnaire,
    });
    setup({ metadata });

    await waitFor(() => {
      expect(screen.getByText('Question 1')).toBeInTheDocument();
    });

    const questionInput = screen.getByLabelText('Question 1');
    await act(async () => {
      await userEvent.type(questionInput, 'Answer');
    });

    await waitFor(() => {
      expect(mockUpdateTestMetadata).toHaveBeenCalled();
    });

    const calls = mockUpdateTestMetadata.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe(mockTest);
    expect(lastCall[1]).toHaveProperty('aoeResponses');
    expect(lastCall[1].aoeResponses).toHaveProperty('resourceType', 'QuestionnaireResponse');
  });

  test('Renders test display name correctly', () => {
    const customTest: TestCoding = {
      code: 'TEST002',
      display: 'Lipid Panel',
      system: 'http://loinc.org',
    };
    const metadata = createMockMetadata();
    setup({ test: customTest, metadata });

    expect(screen.getByText('Lipid Panel')).toBeInTheDocument();
  });
});
