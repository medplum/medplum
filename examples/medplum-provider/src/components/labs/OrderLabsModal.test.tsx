// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Patient, QuestionnaireResponse, ServiceRequest } from '@medplum/fhirtypes';
import type { LabOrganization, TestCoding } from '@medplum/health-gorilla-core';
import { LabOrderValidationError } from '@medplum/health-gorilla-core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '../../test-utils/render';
import * as notifications from '../../utils/notifications';
import { OrderLabsModal } from './OrderLabsModal';

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

vi.mock('../../utils/labOrderDraft', () => ({
  getLabOrderDraftDefaults: vi.fn(),
  saveLabOrderDraft: vi.fn(),
}));

import { useHealthGorillaLabOrder } from '@medplum/health-gorilla-react';
import { MemoryRouter, useParams } from 'react-router';
import { getLabOrderDraftDefaults, saveLabOrderDraft } from '../../utils/labOrderDraft';

describe('OrderLabsModal', () => {
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
    };

    mockLabOrderReturn = {
      state: {
        performingLab: undefined,
        performingLabAccountNumber: undefined,
        performingLabPhysicianAccountNumber: undefined,
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
      setPerformingLabPhysicianAccountNumber: vi.fn(),
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

  function setup(
    props: {
      patientId?: string;
      patient?: Patient;
      draftOrder?: ServiceRequest;
      onSaveDraft?: (draft: WithId<ServiceRequest>) => void;
    } = {}
  ): void {
    vi.mocked(useParams).mockReturnValue({ patientId: props.patientId });

    if (props.patientId) {
      vi.spyOn(medplum, 'readResource').mockResolvedValue(HomerSimpson as typeof HomerSimpson & { id: string });
    }

    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <OrderLabsModal
            opened
            onClose={vi.fn()}
            patient={props.patient}
            draftOrder={props.draftOrder}
            onSubmitLabOrder={mockOnSubmitLabOrder}
            onSaveDraft={props.onSaveDraft}
          />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  const draftOrder: WithId<ServiceRequest> = {
    resourceType: 'ServiceRequest',
    id: 'draft-123',
    status: 'draft',
    intent: 'order',
    subject: { reference: `Patient/${HomerSimpson.id}` },
  };

  test('Renders form fields', async () => {
    setup();

    expect(screen.getByText('Requester')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Patient/)).toBeInTheDocument();
    expect(screen.getByText('Selected tests')).toBeInTheDocument();
    expect(screen.getByText('Diagnoses')).toBeInTheDocument();
    expect(screen.getByText('Bill to')).toBeInTheDocument();
    expect(screen.getByText('Order notes')).toBeInTheDocument();
    expect(screen.getByText('Specimen collection time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Order' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
    // Drain pending async state updates (e.g. ResourceInput defaultValue resolution)
    await act(async () => {});
  });

  test('Saves a new order as a draft without sending it', async () => {
    const onSaveDraft = vi.fn();
    vi.mocked(saveLabOrderDraft).mockResolvedValue(draftOrder);
    setup({ patient: HomerSimpson, onSaveDraft });

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledWith(draftOrder);
    });
    expect(saveLabOrderDraft).toHaveBeenCalledWith(
      medplum,
      expect.objectContaining({ billingInformation: { billTo: 'patient' } }),
      undefined
    );
    expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Draft Saved' }));
    expect(medplum.executeBot).not.toHaveBeenCalled();
  });

  test('Shows validation errors when the draft cannot be saved', async () => {
    const onSaveDraft = vi.fn();
    vi.mocked(saveLabOrderDraft).mockRejectedValue(
      new LabOrderValidationError({ selectedTests: { message: 'At least one test must be selected' } })
    );
    setup({ onSaveDraft });

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    expect(await screen.findByText('At least one test must be selected')).toBeInTheDocument();
    expect(notifications.showErrorNotification).not.toHaveBeenCalled();
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  test('Shows a notification when saving the draft fails', async () => {
    const onSaveDraft = vi.fn();
    const error = new Error('Network error');
    vi.mocked(saveLabOrderDraft).mockRejectedValue(error);
    setup({ onSaveDraft });

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => {
      expect(notifications.showErrorNotification).toHaveBeenCalledWith(error);
    });
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  test('Loads patient when patientId is provided', async () => {
    setup({ patientId: 'patient-123' });

    await waitFor(() => {
      expect(medplum.readResource).toHaveBeenCalledWith('Patient', 'patient-123');
    });
  });

  test('Displays loaded patient in patient input after async fetch', async () => {
    // ResourceInput captures defaultValue at mount only. The patient is loaded
    // asynchronously, so the input must remount once `patient` resolves —
    // `key={patient?.id ?? 'patient'}` forces that remount so the loaded
    // patient is reflected in the input.
    setup({ patientId: 'patient-123' });

    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Shows test metadata cards when tests are selected', async () => {
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
    // Drain pending async state updates (e.g. ResourceInput defaultValue resolution)
    await act(async () => {});
  });

  test('Shows coverage input when patient is set', async () => {
    mockLabOrderReturn.state.performingLab = {
      resourceType: 'Organization',
      id: 'lab-123',
    };
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

  test('Renders specimen collection date time input', async () => {
    setup();

    expect(screen.getByText('Specimen collection time')).toBeInTheDocument();
    expect(screen.getByText('Specimen collection time')).toBeInTheDocument();
    // Drain pending async state updates (e.g. ResourceInput defaultValue resolution)
    await act(async () => {});
  });

  describe('Resuming a draft', () => {
    const mockTest: TestCoding = { code: 'TEST001', display: 'Complete Blood Count', system: 'http://loinc.org' };
    const aoeResponse: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'completed' };

    beforeEach(async () => {
      await medplum.createResource({
        resourceType: 'Encounter',
        id: 'enc-1',
        status: 'finished',
        class: { code: 'AMB' },
      });
      vi.mocked(getLabOrderDraftDefaults).mockResolvedValue({
        patient: HomerSimpson,
        requester: { resourceType: 'Practitioner', id: 'req-1', name: [{ given: ['Dr'], family: 'Who' }] },
        performingLab: { resourceType: 'Organization', id: 'lab-123', name: 'Test Lab' },
        encounter: { reference: 'Encounter/enc-1' },
        task: { resourceType: 'Task', id: 'task-1', status: 'requested', intent: 'order' },
        performingLabAccountNumber: 'ACCT-1',
        performingLabPhysicianAccountNumber: 'PHY-1',
        tests: [mockTest],
        unresolvedTests: [{ system: 'http://loinc.org', code: '24323-8', display: 'Metabolic panel' }],
        testMetadata: { TEST001: { priority: 'stat', notes: 'Run first', aoeResponses: aoeResponse } },
        diagnoses: [{ coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E11.9', display: 'Diabetes' }] }],
        billTo: 'insurance',
        orderNotes: 'Fasting',
        specimenCollectedDateTime: new Date('2024-03-01T10:00:00.000Z'),
      });
      // Like the real hook, hand out new setter identities on every render so the
      // draft must not be re-applied whenever the page re-renders.
      vi.mocked(useHealthGorillaLabOrder).mockImplementation(() => ({
        ...mockLabOrderReturn,
        updateTestMetadata: (...args) => mockLabOrderReturn.updateTestMetadata(...args),
        setDiagnoses: (...args) => mockLabOrderReturn.setDiagnoses(...args),
        updateBillingInformation: (...args) => mockLabOrderReturn.updateBillingInformation(...args),
        setPerformingLabAccountNumber: (...args) => mockLabOrderReturn.setPerformingLabAccountNumber(...args),
        setOrderNotes: (...args) => mockLabOrderReturn.setOrderNotes(...args),
        setSpecimenCollectedDateTime: (...args) => mockLabOrderReturn.setSpecimenCollectedDateTime(...args),
      }));
    });

    test('seeds the form from the draft and revokes it after the new order is sent', async () => {
      vi.spyOn(medplum, 'patchResource').mockResolvedValue({ ...draftOrder, status: 'revoked' });
      const updateResource = vi.spyOn(medplum, 'updateResource');
      setup({ draftOrder });

      expect(await screen.findByRole('button', { name: 'Submit Order' })).toBeInTheDocument();
      expect(getLabOrderDraftDefaults).toHaveBeenCalledWith(medplum, draftOrder);

      expect(mockLabOrderReturn.setTests).toHaveBeenCalledWith([mockTest]);
      expect(mockLabOrderReturn.updateTestMetadata).toHaveBeenCalledWith(mockTest, {
        priority: 'stat',
        notes: 'Run first',
        aoeResponses: aoeResponse,
      });
      expect(mockLabOrderReturn.setPerformingLabPhysicianAccountNumber).toHaveBeenCalledWith('PHY-1');
      expect(mockLabOrderReturn.setPerformingLab).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'Organization', id: 'lab-123' })
      );
      expect(mockLabOrderReturn.setPerformingLabAccountNumber).toHaveBeenCalledWith('ACCT-1');
      expect(mockLabOrderReturn.setDiagnoses).toHaveBeenCalledWith([
        expect.objectContaining({ coding: [expect.objectContaining({ code: 'E11.9' })] }),
      ]);
      expect(mockLabOrderReturn.updateBillingInformation).toHaveBeenCalledWith({ billTo: 'insurance' });
      expect(mockLabOrderReturn.setOrderNotes).toHaveBeenCalledWith('Fasting');
      expect(mockLabOrderReturn.setSpecimenCollectedDateTime).toHaveBeenCalledWith(
        new Date('2024-03-01T10:00:00.000Z')
      );
      expect(screen.getByLabelText('Order notes')).toHaveValue('Fasting');
      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
      expect(screen.getByText('Dr Who')).toBeInTheDocument();
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'yellow', message: expect.stringContaining('Metabolic panel') })
      );
      // The draft is applied once, not on every re-render
      expect(
        vi.mocked(mockLabOrderReturn.updateBillingInformation).mock.calls.filter(([info]) => info.billTo)
      ).toHaveLength(1);
      expect(mockLabOrderReturn.updateTestMetadata).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Submit Order' }));

      await waitFor(() => {
        expect(mockOnSubmitLabOrder).toHaveBeenCalled();
      });
      // The new order is linked to the draft's encounter and its task now points at the new order
      expect(medplum.executeBot).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ encounter: { reference: 'Encounter/enc-1' } }),
        expect.anything()
      );
      expect(updateResource).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Task',
          id: 'task-1',
          focus: { reference: 'ServiceRequest/order-123' },
        })
      );
      expect(medplum.patchResource).toHaveBeenCalledWith('ServiceRequest', 'draft-123', [
        { op: 'replace', path: '/status', value: 'revoked' },
      ]);
    });

    test('saves edits back to the resumed draft', async () => {
      const onSaveDraft = vi.fn();
      vi.mocked(saveLabOrderDraft).mockResolvedValue(draftOrder);
      setup({ draftOrder, onSaveDraft });

      fireEvent.click(await screen.findByRole('button', { name: 'Save Draft' }));

      await waitFor(() => {
        expect(onSaveDraft).toHaveBeenCalledWith(draftOrder);
      });
      expect(saveLabOrderDraft).toHaveBeenCalledWith(medplum, expect.anything(), draftOrder);
    });

    test('still shows the form when the draft cannot be loaded', async () => {
      vi.mocked(getLabOrderDraftDefaults).mockRejectedValue(new Error('Forbidden'));
      setup({ draftOrder });

      expect(await screen.findByRole('button', { name: 'Submit Order' })).toBeInTheDocument();
      expect(notifications.showErrorNotification).toHaveBeenCalled();
    });

    test('does not revoke the draft when sending fails', async () => {
      vi.spyOn(medplum, 'executeBot').mockRejectedValue(new Error('Bot execution failed'));
      vi.spyOn(medplum, 'patchResource');
      setup({ draftOrder });

      fireEvent.click(await screen.findByRole('button', { name: 'Submit Order' }));

      await waitFor(() => {
        expect(notifications.showErrorNotification).toHaveBeenCalled();
      });
      expect(medplum.patchResource).not.toHaveBeenCalled();
      expect(mockOnSubmitLabOrder).not.toHaveBeenCalled();
    });
  });
});
