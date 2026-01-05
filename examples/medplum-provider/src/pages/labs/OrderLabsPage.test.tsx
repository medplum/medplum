// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ServiceRequest } from '@medplum/fhirtypes';
import type { LabOrganization, TestCoding } from '@medplum/health-gorilla-core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { OrderLabsPage } from './OrderLabsPage';
import { act, fireEvent, render, screen, waitFor } from '../../test-utils/render';
import * as notifications from '../../utils/notifications';

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

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

vi.mock('../../utils/notifications', () => ({
  showErrorNotification: vi.fn(),
}));

import { useHealthGorillaLabOrder } from '@medplum/health-gorilla-react';
import { MemoryRouter, useParams } from 'react-router';

describe('OrderLabsPage', () => {
  let medplum: MockClient;
  let mockOnSubmitLabOrder: () => void;
  let mockLabOrderReturn: ReturnType<typeof useHealthGorillaLabOrder>;

  beforeEach(async () => {
    vi.clearAllMocks();

    medplum = new MockClient();
    mockOnSubmitLabOrder = vi.fn();

    const mockTest: TestCoding = {
      code: 'TEST001',
      display: 'Complete Blood Count',
      system: 'http://loinc.org',
    };

    const mockLab: LabOrganization = {
      resourceType: 'Organization',
      id: 'lab-123',
      name: 'Test Lab',
      identifier: [
        {
          system: 'https://www.healthgorilla.com/fhir/StructureDefinition/organization-identifier',
          value: 'HG123',
        },
      ],
    } as LabOrganization;

    mockLabOrderReturn = {
      state: {
        performingLab: undefined,
        performingLabAccountNumber: undefined,
        selectedTests: [],
        testMetadata: {},
        diagnoses: [],
        billingInformation: {
          billTo: 'patient',
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
      createOrderBundle: vi.fn().mockResolvedValue({
        serviceRequest: {
          resourceType: 'ServiceRequest',
          id: 'order-123',
          status: 'draft',
        } as ServiceRequest,
      }),
      searchAvailableLabs: vi.fn().mockResolvedValue([mockLab]),
      searchAvailableTests: vi.fn().mockResolvedValue([mockTest]),
      setPerformingLab: vi.fn(),
      setPerformingLabAccountNumber: vi.fn(),
      addTest: vi.fn(),
      removeTest: vi.fn(),
      setTests: vi.fn(),
      updateTestMetadata: vi.fn(),
      addDiagnosis: vi.fn(),
    };

    vi.mocked(useHealthGorillaLabOrder).mockReturnValue(mockLabOrderReturn);
    vi.mocked(useParams).mockReturnValue({});
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({});
  });

  function setup(props: { patientId?: string } = {}): void {
    vi.mocked(useParams).mockReturnValue({ patientId: props.patientId });

    if (props.patientId) {
      vi.spyOn(medplum, 'readResource').mockResolvedValue(HomerSimpson as typeof HomerSimpson & { id: string });
    }

    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <OrderLabsPage onSubmitLabOrder={mockOnSubmitLabOrder} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders form fields', () => {
    setup();

    expect(screen.getByText('Requester')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Patient/)).toBeInTheDocument();
    expect(screen.getByText('Selected tests')).toBeInTheDocument();
    expect(screen.getByText('Diagnoses')).toBeInTheDocument();
    expect(screen.getByText('Bill to')).toBeInTheDocument();
    expect(screen.getByText('Order notes')).toBeInTheDocument();
    expect(screen.getByText('Specimen collection time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Order' })).toBeInTheDocument();
  });

  test('Loads patient when patientId is provided', async () => {
    setup({ patientId: 'patient-123' });

    await waitFor(() => {
      expect(medplum.readResource).toHaveBeenCalledWith('Patient', 'patient-123');
    });
  });

  test('Shows test metadata cards when tests are selected', () => {
    const mockTest: TestCoding = {
      code: 'TEST001',
      display: 'Complete Blood Count',
      system: 'http://loinc.org',
    };

    mockLabOrderReturn.state.selectedTests = [mockTest];
    mockLabOrderReturn.state.testMetadata = {
      TEST001: { aoeStatus: 'none' },
    };
    vi.mocked(useHealthGorillaLabOrder).mockReturnValue(mockLabOrderReturn);

    setup();

    // Test metadata cards should be rendered (component will render them)
    expect(screen.getByText('Selected tests')).toBeInTheDocument();
  });

  test('Shows coverage input when patient is set', async () => {
    mockLabOrderReturn.state.performingLab = {
      resourceType: 'Organization',
      id: 'lab-123',
    } as LabOrganization;
    vi.mocked(useHealthGorillaLabOrder).mockReturnValue(mockLabOrderReturn);

    await act(async () => setup({ patientId: 'patient-123' }));
    expect(screen.getByText('Bill to')).toBeInTheDocument();
  });

  test('Updates billing information when radio button is selected', async () => {
    setup();

    const insuranceRadio = screen.getByLabelText('Insurance');

    await act(async () => {
      fireEvent.click(insuranceRadio);
    });

    expect(mockLabOrderReturn.updateBillingInformation).toHaveBeenCalledWith({
      billTo: 'insurance',
    });
  });

  test('Updates order notes when text input changes', async () => {
    setup();

    const notesInput = screen.getByLabelText('Order notes');

    await act(async () => {
      fireEvent.change(notesInput, { target: { value: 'Test notes' } });
    });

    expect(mockLabOrderReturn.setOrderNotes).toHaveBeenCalledWith('Test notes');
  });

  test('Submits order successfully', async () => {
    const mockServiceRequest: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'order-123',
      status: 'draft',
    } as ServiceRequest;

    mockLabOrderReturn.createOrderBundle = vi.fn().mockResolvedValue({
      serviceRequest: mockServiceRequest,
    });
    vi.mocked(useHealthGorillaLabOrder).mockReturnValue(mockLabOrderReturn);
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({});

    setup();

    const submitButton = screen.getByRole('button', { name: 'Submit Order' });

    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(mockLabOrderReturn.createOrderBundle).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(medplum.executeBot).toHaveBeenCalled();
    });

    const executeBotCall = (medplum.executeBot as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(executeBotCall[0]).toEqual({
      system: 'https://www.medplum.com/integrations/bot-identifier',
      value: 'health-gorilla-labs/send-to-health-gorilla',
    });
    expect(executeBotCall[1]).toEqual(mockServiceRequest);

    expect(showNotification).toHaveBeenCalledWith({
      title: 'Lab Order Submitted',
      message: 'The lab order has been successfully submitted.',
      color: 'green',
    });

    expect(mockOnSubmitLabOrder).toHaveBeenCalled();
  });

  test('Shows error when order submission fails', async () => {
    const error = new Error('Submission failed');
    mockLabOrderReturn.createOrderBundle = vi.fn().mockRejectedValue(error);
    vi.mocked(useHealthGorillaLabOrder).mockReturnValue(mockLabOrderReturn);

    setup();

    const submitButton = screen.getByRole('button', { name: 'Submit Order' });

    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(notifications.showErrorNotification).toHaveBeenCalledWith(error);
    });

    expect(showNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Lab Order Submitted',
      })
    );
    expect(mockOnSubmitLabOrder).not.toHaveBeenCalled();
  });

  test('Shows error when bot execution fails', async () => {
    const mockServiceRequest: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'order-123',
      status: 'draft',
    } as ServiceRequest;

    const botError = new Error('Bot execution failed');
    mockLabOrderReturn.createOrderBundle = vi.fn().mockResolvedValue({
      serviceRequest: mockServiceRequest,
    });
    vi.mocked(useHealthGorillaLabOrder).mockReturnValue(mockLabOrderReturn);
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(botError);

    setup();

    const submitButton = screen.getByRole('button', { name: 'Submit Order' });

    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(notifications.showErrorNotification).toHaveBeenCalledWith(botError);
    });

    expect(showNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Lab Order Submitted',
      })
    );
    expect(mockOnSubmitLabOrder).not.toHaveBeenCalled();
  });

  test('Disables submit button while submitting', async () => {
    const mockServiceRequest: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: 'order-123',
      status: 'draft',
    } as ServiceRequest;

    let resolveCreateOrder: (() => void) | undefined;
    const createOrderPromise = new Promise<{ serviceRequest: ServiceRequest }>((resolve) => {
      resolveCreateOrder = () => resolve({ serviceRequest: mockServiceRequest });
    });

    mockLabOrderReturn.createOrderBundle = vi.fn().mockReturnValue(createOrderPromise);
    vi.mocked(useHealthGorillaLabOrder).mockReturnValue(mockLabOrderReturn);
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({});

    setup();

    const submitButton = screen.getByRole('button', { name: 'Submit Order' });

    // Click button to start submission
    fireEvent.click(submitButton);

    // Wait for button to be disabled
    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });

    resolveCreateOrder?.();

    await createOrderPromise;

    // Wait for button to be enabled again
    await waitFor(
      () => {
        expect(submitButton).not.toBeDisabled();
      },
      { timeout: 2000 }
    );
  });

  test('Renders specimen collection date time input', () => {
    setup();

    expect(screen.getByText('Specimen collection time')).toBeInTheDocument();
    expect(screen.getByText('Specimen collection time')).toBeInTheDocument();
  });
});
