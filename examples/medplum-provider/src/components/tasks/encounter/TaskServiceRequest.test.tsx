// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DiagnosticReport, ServiceRequest, Task } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { TaskServiceRequest } from './TaskServiceRequest';
import { act, fireEvent, render, screen, waitFor } from '../../../test-utils/render';
import { useHealthGorillaLabOrder } from '@medplum/health-gorilla-react';
import { useParams } from 'react-router';
import type { WithId } from '@medplum/core';

vi.mock('@medplum/health-gorilla-react', async () => {
  const actual = await vi.importActual('@medplum/health-gorilla-react');
  return {
    ...actual,
    useHealthGorillaLabOrder: vi.fn(),
  };
});

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useParams: vi.fn(),
  };
});

const SNOMED_SYSTEM = 'http://snomed.info/sct';
const SNOMED_DIAGNOSTIC_REPORT_CODE = '108252007';

describe('TaskServiceRequest', () => {
  let medplum: MockClient;
  let mockSaveDiagnosticReport: (diagnosticReport: DiagnosticReport) => void;
  let mockServiceRequest: ServiceRequest;
  let mockTask: Task;

  beforeEach(async () => {
    vi.clearAllMocks();
    medplum = new MockClient();
    mockSaveDiagnosticReport = vi.fn();

    mockServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'service-request-123',
      status: 'draft',
      code: {
        coding: [
          {
            system: SNOMED_SYSTEM,
            code: '123456789',
            display: 'Complete Blood Count',
          },
          {
            system: SNOMED_SYSTEM,
            code: '987654321',
            display: 'Metabolic Panel',
          },
          {
            system: SNOMED_SYSTEM,
            code: SNOMED_DIAGNOSTIC_REPORT_CODE,
            display: 'Diagnostic Report',
          },
        ],
      },
      subject: { reference: `Patient/${HomerSimpson.id}` },
    } as ServiceRequest;

    mockTask = {
      resourceType: 'Task',
      id: 'task-123',
      focus: { reference: 'ServiceRequest/service-request-123' },
      for: { reference: `Patient/${HomerSimpson.id}` },
      encounter: { reference: 'Encounter/encounter-123' },
    } as Task;

    // Create the ServiceRequest in MockClient so useResource can fetch it
    await medplum.createResource(mockServiceRequest);
    vi.mocked(useParams).mockReturnValue({});
    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockServiceRequest as WithId<ServiceRequest>);

    // Mock useHealthGorillaLabOrder
    vi.mocked(useHealthGorillaLabOrder).mockReturnValue({
      state: {
        performingLab: undefined,
        performingLabAccountNumber: undefined,
        selectedTests: [],
        testMetadata: {},
        diagnoses: [],
        billingInformation: { billTo: 'patient' },
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
      createOrderBundle: vi.fn().mockResolvedValue({
        serviceRequest: {
          resourceType: 'ServiceRequest',
          id: 'test-order-123',
          status: 'draft',
        } as ServiceRequest,
      }),
      searchAvailableLabs: vi.fn().mockResolvedValue([]),
      searchAvailableTests: vi.fn().mockResolvedValue([]),
      setPerformingLab: vi.fn(),
      setPerformingLabAccountNumber: vi.fn(),
      addTest: vi.fn(),
      removeTest: vi.fn(),
      setTests: vi.fn(),
      updateTestMetadata: vi.fn(),
      addDiagnosis: vi.fn(),
    });
  });

  function setup(task: Task = mockTask): void {
    render(
      <MedplumProvider medplum={medplum}>
        <TaskServiceRequest task={task} saveDiagnosticReport={mockSaveDiagnosticReport} />
      </MedplumProvider>
    );
  }

  test('renders loading state when serviceRequest is not available', async () => {
    const taskWithoutFocus: Task = {
      ...mockTask,
      focus: undefined,
    };
    setup(taskWithoutFocus);

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  test('renders task display string', async () => {
    setup();

    await waitFor(() => {
      // Component displays getDisplayString(task), which shows "Task/task-123"
      expect(screen.getByText('Task/task-123')).toBeInTheDocument();
    });
  });

  test('renders fallback title when no SNOMED codes found', async () => {
    const serviceRequestWithoutSnomed = {
      ...mockServiceRequest,
      id: 'service-request-no-snomed',
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: 'CBC',
            display: 'CBC',
          },
        ],
      },
    };
    await medplum.createResource(serviceRequestWithoutSnomed);
    const taskWithoutSnomed: Task = {
      ...mockTask,
      focus: { reference: 'ServiceRequest/service-request-no-snomed' },
    };
    setup(taskWithoutSnomed);

    await waitFor(() => {
      expect(screen.queryByText('SNOMED:')).not.toBeInTheDocument();
    });
  });

  test('shows Request Labs button when labServiceRequest status is draft', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request Labs' })).toBeInTheDocument();
    });
  });

  test('shows order sent message when labServiceRequest status is not draft', async () => {
    const activeServiceRequest: ServiceRequest = {
      ...mockServiceRequest,
      status: 'active',
      requisition: { value: 'REQ-12345' },
    };
    vi.spyOn(medplum, 'readReference').mockResolvedValue(activeServiceRequest as WithId<ServiceRequest>);
    setup();

    await waitFor(() => {
      expect(screen.getByText(/✅ Order Sent/)).toBeInTheDocument();
      expect(screen.getByText(/Requisition: REQ-12345/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View in Labs' })).toBeInTheDocument();
    });
  });

  test('opens modal when Request Labs button is clicked', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request Labs' })).toBeInTheDocument();
    });

    const requestButton = screen.getByRole('button', { name: 'Request Labs' });
    await act(async () => {
      fireEvent.click(requestButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Order Labs')).toBeInTheDocument();
      expect(screen.getByText('Requester')).toBeInTheDocument();
    });
  });

  test('closes modal when onClose is called', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request Labs' })).toBeInTheDocument();
    });

    const requestButton = screen.getByRole('button', { name: 'Request Labs' });
    await act(async () => {
      fireEvent.click(requestButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Order Labs')).toBeInTheDocument();
    });

    const closeButton = document.querySelector('.mantine-Modal-close');
    if (closeButton) {
      await act(async () => {
        fireEvent.click(closeButton);
      });
    }

    await waitFor(() => {
      expect(screen.queryByText('Order Labs')).not.toBeInTheDocument();
    });
  });

  test('filters out diagnostic report code from tests', async () => {
    const setTestsSpy = vi.fn();
    vi.mocked(useHealthGorillaLabOrder).mockReturnValue({
      state: {
        performingLab: undefined,
        performingLabAccountNumber: undefined,
        selectedTests: [],
        testMetadata: {},
        diagnoses: [],
        billingInformation: { billTo: 'patient' },
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
      createOrderBundle: vi.fn().mockResolvedValue({
        serviceRequest: {
          resourceType: 'ServiceRequest',
          id: 'test-order-123',
          status: 'draft',
        } as ServiceRequest,
      }),
      searchAvailableLabs: vi.fn().mockResolvedValue([]),
      searchAvailableTests: vi.fn().mockResolvedValue([]),
      setPerformingLab: vi.fn(),
      setPerformingLabAccountNumber: vi.fn(),
      addTest: vi.fn(),
      removeTest: vi.fn(),
      setTests: setTestsSpy,
      updateTestMetadata: vi.fn(),
      addDiagnosis: vi.fn(),
    });

    setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request Labs' })).toBeInTheDocument();
    });

    const requestButton = screen.getByRole('button', { name: 'Request Labs' });
    await act(async () => {
      fireEvent.click(requestButton);
    });

    await waitFor(() => {
      expect(setTestsSpy).toHaveBeenCalled();
      const calls = setTestsSpy.mock.calls;
      const testsPassed = calls[calls.length - 1][0];
      // Should only have 2 tests, not 3 (diagnostic report code filtered out)
      expect(testsPassed).toHaveLength(2);
      expect(testsPassed.every((test: { code: string }) => test.code !== SNOMED_DIAGNOSTIC_REPORT_CODE)).toBe(true);
    });
  });

  test('handles new order creation and closes modal', async () => {
    const createOrderBundleSpy = vi.fn().mockResolvedValue({
      serviceRequest: {
        resourceType: 'ServiceRequest',
        id: 'test-order-123',
        status: 'active',
      } as ServiceRequest,
    });
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({});

    vi.mocked(useHealthGorillaLabOrder).mockReturnValue({
      state: {
        performingLab: undefined,
        performingLabAccountNumber: undefined,
        selectedTests: [],
        testMetadata: {},
        diagnoses: [],
        billingInformation: { billTo: 'patient' },
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
      createOrderBundle: createOrderBundleSpy,
      searchAvailableLabs: vi.fn().mockResolvedValue([]),
      searchAvailableTests: vi.fn().mockResolvedValue([]),
      setPerformingLab: vi.fn(),
      setPerformingLabAccountNumber: vi.fn(),
      addTest: vi.fn(),
      removeTest: vi.fn(),
      setTests: vi.fn(),
      updateTestMetadata: vi.fn(),
      addDiagnosis: vi.fn(),
    });

    setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request Labs' })).toBeInTheDocument();
    });

    const requestButton = screen.getByRole('button', { name: 'Request Labs' });
    await act(async () => {
      fireEvent.click(requestButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Order Labs')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit Order' })).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: 'Submit Order' });
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(createOrderBundleSpy).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByText('Order Labs')).not.toBeInTheDocument();
    });

    // After order is created, should show order sent message
    await waitFor(() => {
      expect(screen.getByText(/✅ Order Sent/)).toBeInTheDocument();
    });
  });

  test('renders View in Labs link with correct href', async () => {
    const activeServiceRequest: ServiceRequest = {
      ...mockServiceRequest,
      id: 'lab-order-456',
      status: 'active',
      requisition: { value: 'REQ-12345' },
    };
    vi.spyOn(medplum, 'readReference').mockResolvedValue(activeServiceRequest as WithId<ServiceRequest>);
    setup();

    await waitFor(() => {
      const viewLink = screen.getByRole('link', { name: 'View in Labs' });
      expect(viewLink).toHaveAttribute('href', `/Patient/${HomerSimpson.id}/ServiceRequest/lab-order-456`);
      expect(viewLink).toHaveAttribute('target', '_blank');
    });
  });

  test('handles task without encounter reference', async () => {
    const taskWithoutEncounter = {
      ...mockTask,
      encounter: undefined,
    };
    setup(taskWithoutEncounter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request Labs' })).toBeInTheDocument();
    });
  });

  test('handles service request without code coding', async () => {
    const serviceRequestWithoutCode = {
      ...mockServiceRequest,
      id: 'service-request-no-code',
      code: undefined,
    };
    await medplum.createResource(serviceRequestWithoutCode);
    const taskWithoutCode: Task = {
      ...mockTask,
      focus: { reference: 'ServiceRequest/service-request-no-code' },
    };
    setup(taskWithoutCode);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request Labs' })).toBeInTheDocument();
    });

    const requestButton = screen.getByRole('button', { name: 'Request Labs' });
    await act(async () => {
      fireEvent.click(requestButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Order Labs')).toBeInTheDocument();
      expect(screen.getByText('Requester')).toBeInTheDocument();
    });
  });
});
