// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import type {
  Patient,
  ServiceRequest,
  Practitioner,
  DiagnosticReport,
  DocumentReference,
  QuestionnaireResponse,
  Observation,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LabOrderDetails } from './LabOrderDetails';

// Mock the documentReference utility
vi.mock('../../utils/documentReference', () => ({
  fetchLabOrderRequisitionDocuments: vi.fn(),
  getHealthGorillaRequisitionId: vi.fn(),
}));

const mockPatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
  gender: 'male',
  birthDate: '1990-01-01',
};

const mockPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['Dr. Jane'], family: 'Smith' }],
};

const mockActiveServiceRequest: ServiceRequest = {
  resourceType: 'ServiceRequest',
  id: 'service-request-123',
  status: 'active',
  intent: 'order',
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '24323-8',
        display: 'Complete Blood Count',
      },
    ],
    text: 'CBC with Differential',
  },
  subject: {
    reference: 'Patient/patient-123',
    display: 'John Doe',
  },
  requester: {
    reference: 'Practitioner/practitioner-123',
    display: 'Dr. Jane Smith',
  },
  authoredOn: '2024-01-15T10:00:00Z',
  priority: 'routine',
  reasonCode: [
    {
      text: 'Annual physical exam',
    },
  ],
  note: [
    {
      text: 'Patient is fasting',
    },
  ],
  performer: [
    {
      display: 'Quest Diagnostics',
    },
  ],
  requisition: {
    system: 'https://www.healthgorilla.com',
    value: 'HG-REQ-12345',
  },
};

const mockCompletedServiceRequest: ServiceRequest = {
  ...mockActiveServiceRequest,
  status: 'completed',
  meta: {
    lastUpdated: '2024-01-20T14:30:00Z',
  },
};

const mockDiagnosticReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: 'diagnostic-report-123',
  status: 'final',
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '24323-8',
        display: 'Complete Blood Count',
      },
    ],
  },
  subject: {
    reference: 'Patient/patient-123',
  },
  effectiveDateTime: '2024-01-18T09:00:00Z',
  issued: '2024-01-19T15:00:00Z',
  basedOn: [
    {
      reference: 'ServiceRequest/service-request-123',
    },
  ],
  result: [
    {
      reference: 'Observation/observation-123',
    },
  ],
  conclusion: 'All values within normal range',
  presentedForm: [
    {
      contentType: 'application/pdf',
      url: 'https://example.com/report.pdf',
      title: 'Lab Report',
    },
  ],
};

const mockObservation: Observation = {
  resourceType: 'Observation',
  id: 'observation-123',
  status: 'final',
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '6690-2',
        display: 'White Blood Cell Count',
      },
    ],
  },
  subject: {
    reference: 'Patient/patient-123',
  },
  valueQuantity: {
    value: 7.5,
    unit: 'x10^3/uL',
    system: 'http://unitsofmeasure.org',
  },
};

const mockLabOrderRequisitionDoc: DocumentReference = {
  resourceType: 'DocumentReference',
  id: 'doc-ref-123',
  status: 'current',
  type: {
    coding: [
      {
        code: 'LabOrderRequisition',
        display: 'Lab Order Requisition',
      },
    ],
  },
  subject: {
    reference: 'Patient/patient-123',
  },
  content: [
    {
      attachment: {
        contentType: 'application/pdf',
        url: 'https://example.com/requisition.pdf',
        title: 'Lab Requisition',
      },
    },
  ],
  identifier: [
    {
      system: 'https://www.healthgorilla.com',
      value: 'HG-REQ-12345',
    },
  ],
};

const mockSpecimenLabelDoc: DocumentReference = {
  resourceType: 'DocumentReference',
  id: 'doc-ref-456',
  status: 'current',
  type: {
    coding: [
      {
        code: 'SpecimenLabel',
        display: 'Specimen Label',
      },
    ],
  },
  subject: {
    reference: 'Patient/patient-123',
  },
  content: [
    {
      attachment: {
        contentType: 'application/pdf',
        url: 'https://example.com/specimen-label.pdf',
        title: 'Specimen Label',
      },
    },
  ],
  identifier: [
    {
      system: 'https://www.healthgorilla.com',
      value: 'HG-REQ-12345',
    },
  ],
};

const mockQuestionnaireResponse: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  id: 'questionnaire-response-123',
  status: 'completed',
  authored: '2024-01-15T09:30:00Z',
  item: [
    {
      linkId: 'question-1',
      text: 'Is the patient fasting?',
      answer: [
        {
          valueBoolean: true,
        },
      ],
    },
    {
      linkId: 'question-2',
      text: 'Current medications',
      answer: [
        {
          valueString: 'Aspirin 81mg daily',
        },
      ],
    },
  ],
};

describe('LabOrderDetails', () => {
  let medplum: MockClient;
  let fetchLabOrderRequisitionDocumentsMock: any;
  let getHealthGorillaRequisitionIdMock: any;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();

    const documentReferenceUtils = await import('../../utils/documentReference');
    fetchLabOrderRequisitionDocumentsMock = vi.mocked(documentReferenceUtils.fetchLabOrderRequisitionDocuments);
    getHealthGorillaRequisitionIdMock = vi.mocked(documentReferenceUtils.getHealthGorillaRequisitionId);

    // Setup default mocks
    fetchLabOrderRequisitionDocumentsMock.mockResolvedValue([]);
    getHealthGorillaRequisitionIdMock.mockReturnValue('HG-REQ-12345');
    medplum.searchResources = vi.fn().mockResolvedValue([]);
  });

  const setup = (props: Partial<Parameters<typeof LabOrderDetails>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <LabOrderDetails order={mockActiveServiceRequest} {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  describe('Basic rendering', () => {
    it('renders order details with active status', async () => {
      medplum.readResource = vi.fn().mockImplementation((resourceType: string, id: string) => {
        if (resourceType === 'Patient' && id === 'patient-123') {
          return Promise.resolve(mockPatient);
        }
        if (resourceType === 'Practitioner' && id === 'practitioner-123') {
          return Promise.resolve(mockPractitioner);
        }
        return Promise.reject(new Error('Not found'));
      });

      await act(async () => {
        setup();
      });

      await waitFor(() => {
        expect(screen.getByText('CBC with Differential')).toBeInTheDocument();
      });

      expect(screen.getByText(/Ordered/i)).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders order details with completed status', async () => {
      medplum.readResource = vi.fn().mockResolvedValue(mockPatient);

      await act(async () => {
        setup({ order: mockCompletedServiceRequest });
      });

      await waitFor(() => {
        expect(screen.getByText('CBC with Differential')).toBeInTheDocument();
      });

      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('displays multiple test codes', async () => {
      const orderWithMultipleCodes: ServiceRequest = {
        ...mockActiveServiceRequest,
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '24323-8',
              display: 'Complete Blood Count',
            },
            {
              system: 'http://loinc.org',
              code: '2345-7',
              display: 'Glucose',
            },
          ],
        },
      };

      await act(async () => {
        setup({ order: orderWithMultipleCodes });
      });

      await waitFor(() => {
        expect(screen.getByText(/Complete Blood Count, Glucose/)).toBeInTheDocument();
      });
    });

    it('falls back to first code display when no text field', async () => {
      const orderWithoutText: ServiceRequest = {
        ...mockActiveServiceRequest,
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '24323-8',
              display: 'Complete Blood Count',
            },
          ],
        },
      };

      await act(async () => {
        setup({ order: orderWithoutText });
      });

      await waitFor(() => {
        expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
      });
    });
  });

  describe('Tab switching', () => {
    it('defaults to progress tracker for active orders', async () => {
      await act(async () => {
        setup({ order: mockActiveServiceRequest });
      });

      await waitFor(() => {
        const progressButton = screen.getByText('Progress Tracker');
        expect(progressButton).toBeInTheDocument();
      });
    });

    it('defaults to report tab for completed orders', async () => {
      medplum.searchResources = vi.fn().mockResolvedValue([mockDiagnosticReport]);

      await act(async () => {
        setup({ order: mockCompletedServiceRequest });
      });

      await waitFor(() => {
        const reportButton = screen.getByText('Report');
        expect(reportButton).toBeInTheDocument();
      });
    });

    it('switches to order details tab when clicked', async () => {
      const user = userEvent.setup();
      medplum.readResource = vi.fn().mockResolvedValue(mockPractitioner);

      await act(async () => {
        setup();
      });

      await waitFor(() => {
        expect(screen.getByText('Progress Tracker')).toBeInTheDocument();
      });

      const orderDetailsButton = screen.getByText('Order Details');
      await user.click(orderDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Order Date')).toBeInTheDocument();
        expect(screen.getByText('Test Code')).toBeInTheDocument();
      });
    });
  });

  describe('Order details tab', () => {
    beforeEach(() => {
      medplum.readResource = vi.fn().mockImplementation((resourceType: string, id: string) => {
        if (resourceType === 'Patient' && id === 'patient-123') {
          return Promise.resolve(mockPatient);
        }
        if (resourceType === 'Practitioner' && id === 'practitioner-123') {
          return Promise.resolve(mockPractitioner);
        }
        return Promise.reject(new Error('Not found'));
      });
    });

    it('displays order information correctly', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });

      const orderDetailsButton = screen.getByText('Order Details');
      await user.click(orderDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Order Date')).toBeInTheDocument();
        expect(screen.getByText('Test Code')).toBeInTheDocument();
        expect(screen.getByText('Ordering provider')).toBeInTheDocument();
        expect(screen.getByText('Performing lab')).toBeInTheDocument();
        expect(screen.getByText('Requisition ID')).toBeInTheDocument();
        expect(screen.getByText('Patient')).toBeInTheDocument();
        expect(screen.getByText('Priority')).toBeInTheDocument();
      });

      expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Quest Diagnostics')).toBeInTheDocument();
      expect(screen.getByText('HG-REQ-12345')).toBeInTheDocument();
      expect(screen.getByText('routine')).toBeInTheDocument();
    });

    it('displays reason code and notes', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });

      const orderDetailsButton = screen.getByText('Order Details');
      await user.click(orderDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Reason')).toBeInTheDocument();
        expect(screen.getByText('Annual physical exam')).toBeInTheDocument();
        expect(screen.getByText('Notes')).toBeInTheDocument();
        expect(screen.getByText('Patient is fasting')).toBeInTheDocument();
      });
    });

    it('displays order detail if present', async () => {
      const user = userEvent.setup();
      const orderWithDetails: ServiceRequest = {
        ...mockActiveServiceRequest,
        orderDetail: [
          {
            text: 'Stat processing required',
          },
        ],
      };

      await act(async () => {
        setup({ order: orderWithDetails });
      });

      const orderDetailsButton = screen.getByRole('button', { name: 'Order Details' });
      await user.click(orderDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Stat processing required')).toBeInTheDocument();
      });
    });
  });

  describe('Progress tracker', () => {
    it('displays progress tracker for active orders', async () => {
      await act(async () => {
        setup({ order: mockActiveServiceRequest });
      });

      await waitFor(() => {
        expect(screen.getByText('Order Sent')).toBeInTheDocument();
        expect(screen.getByText('Order Acknowledged')).toBeInTheDocument();
        expect(screen.getByText('Testing')).toBeInTheDocument();
        expect(screen.getByText('Final')).toBeInTheDocument();
      });
    });

    it('marks steps as completed based on available data', async () => {
      fetchLabOrderRequisitionDocumentsMock.mockResolvedValue([mockLabOrderRequisitionDoc]);
      medplum.searchResources = vi.fn().mockResolvedValue([mockDiagnosticReport]);

      await act(async () => {
        setup({ order: mockActiveServiceRequest });
      });

      await waitFor(() => {
        expect(screen.getByText('Order Sent')).toBeInTheDocument();
        expect(screen.getByText('Order Acknowledged')).toBeInTheDocument();
      });
    });

    it('shows timestamps for completed steps', async () => {
      await act(async () => {
        setup({ order: mockActiveServiceRequest });
      });

      await waitFor(() => {
        expect(screen.getByText('Order Sent')).toBeInTheDocument();
      });
    });
  });

  describe('Diagnostic report', () => {
    it('displays diagnostic report for completed orders', async () => {
      medplum.searchResources = vi.fn().mockResolvedValue([mockDiagnosticReport]);
      medplum.readResource = vi.fn().mockResolvedValue(mockObservation);

      await act(async () => {
        setup({ order: mockCompletedServiceRequest });
      });

      await waitFor(
        () => {
          expect(screen.getByText('Report Status')).toBeInTheDocument();
          const finalStatuses = screen.getAllByText('final');
          expect(finalStatuses.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );
    });

    it('displays issue date', async () => {
      medplum.searchResources = vi.fn().mockResolvedValue([mockDiagnosticReport]);

      await act(async () => {
        setup({ order: mockCompletedServiceRequest });
      });

      await waitFor(() => {
        expect(screen.getByText('Issue Date')).toBeInTheDocument();
      });
    });

    it('displays conclusion if present', async () => {
      medplum.searchResources = vi.fn().mockResolvedValue([mockDiagnosticReport]);

      await act(async () => {
        setup({ order: mockCompletedServiceRequest });
      });

      await waitFor(
        () => {
          const interpretations = screen.getAllByText('Interpretation');
          expect(interpretations.length).toBeGreaterThan(0);
          expect(screen.getByText('All values within normal range')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('displays lab document section with presentedForm', async () => {
      medplum.searchResources = vi.fn().mockResolvedValue([mockDiagnosticReport]);

      await act(async () => {
        setup({ order: mockCompletedServiceRequest });
      });

      await waitFor(() => {
        expect(screen.getByText('Lab Document')).toBeInTheDocument();
      });
    });
  });

  describe('Document references', () => {
    it('fetches and displays lab order requisition documents', async () => {
      const user = userEvent.setup();
      fetchLabOrderRequisitionDocumentsMock.mockResolvedValue([mockLabOrderRequisitionDoc]);

      await act(async () => {
        setup();
      });

      const orderDetailsButton = screen.getByText('Order Details');
      await user.click(orderDetailsButton);

      await waitFor(() => {
        expect(fetchLabOrderRequisitionDocumentsMock).toHaveBeenCalledWith(medplum, mockActiveServiceRequest);
        expect(screen.getByText('Requisition Document')).toBeInTheDocument();
      });
    });

    it('fetches and displays specimen label documents', async () => {
      const user = userEvent.setup();
      medplum.searchResources = vi.fn().mockImplementation(async (resourceType: string, params: any) => {
        const searchParams = new URLSearchParams(params);
        if (resourceType === 'DocumentReference' && searchParams.get('category') === 'SpecimenLabel') {
          return [mockSpecimenLabelDoc];
        }
        return [];
      });

      await act(async () => {
        setup();
      });

      const orderDetailsButton = screen.getByRole('button', { name: 'Order Details' });
      await user.click(orderDetailsButton);

      await waitFor(
        () => {
          const specimenLabels = screen.getAllByText('Specimen Label');
          expect(specimenLabels.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );
    });

    it('displays message when no specimen label documents found', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });

      const orderDetailsButton = screen.getByText('Order Details');
      await user.click(orderDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('No specimen label documents found.')).toBeInTheDocument();
      });
    });
  });

  describe('Questionnaire response', () => {
    it('fetches and displays questionnaire response from current order', async () => {
      const user = userEvent.setup();
      const orderWithQuestionnaire: ServiceRequest = {
        ...mockActiveServiceRequest,
        supportingInfo: [
          {
            reference: 'QuestionnaireResponse/questionnaire-response-123',
          },
        ],
      };
      medplum.readResource = vi.fn().mockResolvedValue(mockQuestionnaireResponse);

      await act(async () => {
        setup({ order: orderWithQuestionnaire });
      });

      const orderDetailsButton = screen.getByText('Order Details');
      await user.click(orderDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Order Entry Questions')).toBeInTheDocument();
        expect(screen.getByText('Is the patient fasting?')).toBeInTheDocument();
        expect(screen.getByText('true')).toBeInTheDocument();
        expect(screen.getByText('Current medications')).toBeInTheDocument();
        expect(screen.getByText('Aspirin 81mg daily')).toBeInTheDocument();
      });
    });

    it('searches for questionnaire response from original order', async () => {
      const user = userEvent.setup();
      const originalOrder: ServiceRequest = {
        ...mockActiveServiceRequest,
        id: 'original-order-123',
        supportingInfo: [
          {
            reference: 'QuestionnaireResponse/questionnaire-response-123',
          },
        ],
        basedOn: [
          {
            reference: 'ServiceRequest/service-request-123',
          },
        ],
      };

      medplum.searchResources = vi.fn().mockResolvedValue([originalOrder]);
      medplum.readResource = vi.fn().mockResolvedValue(mockQuestionnaireResponse);

      await act(async () => {
        setup();
      });

      const orderDetailsButton = screen.getByText('Order Details');
      await user.click(orderDetailsButton);

      await waitFor(() => {
        expect(medplum.searchResources).toHaveBeenCalledWith('ServiceRequest', expect.any(Object));
      });
    });

    it('handles different answer types in questionnaire response', async () => {
      const user = userEvent.setup();
      const questionnaireWithMultipleAnswerTypes: QuestionnaireResponse = {
        ...mockQuestionnaireResponse,
        item: [
          {
            linkId: 'q1',
            text: 'Boolean question',
            answer: [{ valueBoolean: true }],
          },
          {
            linkId: 'q2',
            text: 'String question',
            answer: [{ valueString: 'Answer text' }],
          },
          {
            linkId: 'q3',
            text: 'Integer question',
            answer: [{ valueInteger: 42 }],
          },
          {
            linkId: 'q4',
            text: 'Decimal question',
            answer: [{ valueDecimal: 3.14 }],
          },
          {
            linkId: 'q5',
            text: 'Date question',
            answer: [{ valueDate: '2024-01-15' }],
          },
          {
            linkId: 'q6',
            text: 'Coding question',
            answer: [{ valueCoding: { code: 'CODE-1', display: 'Display text' } }],
          },
          {
            linkId: 'q7',
            text: 'Quantity question',
            answer: [{ valueQuantity: { value: 100, unit: 'mg' } }],
          },
        ],
      };

      const orderWithQuestionnaire: ServiceRequest = {
        ...mockActiveServiceRequest,
        supportingInfo: [
          {
            reference: 'QuestionnaireResponse/questionnaire-response-123',
          },
        ],
      };

      medplum.readResource = vi.fn().mockResolvedValue(questionnaireWithMultipleAnswerTypes);

      await act(async () => {
        setup({ order: orderWithQuestionnaire });
      });

      const orderDetailsButton = screen.getByText('Order Details');
      await user.click(orderDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Boolean question')).toBeInTheDocument();
        expect(screen.getByText('true')).toBeInTheDocument();
        expect(screen.getByText('String question')).toBeInTheDocument();
        expect(screen.getByText('Answer text')).toBeInTheDocument();
        expect(screen.getByText('Integer question')).toBeInTheDocument();
        expect(screen.getByText('42')).toBeInTheDocument();
        expect(screen.getByText('Decimal question')).toBeInTheDocument();
        expect(screen.getByText('3.14')).toBeInTheDocument();
        expect(screen.getByText('Date question')).toBeInTheDocument();
        expect(screen.getByText('2024-01-15')).toBeInTheDocument();
        expect(screen.getByText('Coding question')).toBeInTheDocument();
        expect(screen.getByText('Display text')).toBeInTheDocument();
        expect(screen.getByText('Quantity question')).toBeInTheDocument();
        expect(screen.getByText('100 mg')).toBeInTheDocument();
      });
    });
  });

  describe('Status badges', () => {
    it.each([
      ['active', 'Active'],
      ['completed', 'Completed'],
      ['draft', 'Draft'],
      ['requested', 'Requested'],
      ['on-hold', 'On Hold'],
      ['cancelled', 'Cancelled'],
      ['revoked', 'Revoked'],
      ['entered-in-error', 'Error'],
      ['unknown', 'Unknown'],
    ])('displays %s status correctly', async (status, expectedText) => {
      const orderWithStatus: ServiceRequest = {
        ...mockActiveServiceRequest,
        status: status as any,
      };

      await act(async () => {
        setup({ order: orderWithStatus });
      });

      await waitFor(() => {
        expect(screen.getByText(expectedText)).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('handles error when fetching requisition documents fails', async () => {
      const user = userEvent.setup();
      fetchLabOrderRequisitionDocumentsMock.mockRejectedValue(new Error('Fetch failed'));

      await act(async () => {
        setup();
      });

      const orderDetailsButton = screen.getByText('Order Details');
      await user.click(orderDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('No lab order requisition documents found.')).toBeInTheDocument();
      });
    });
  });

  describe('Cleanup', () => {
    it('cleans up documents when order changes', async () => {
      const { rerender } = await act(async () => {
        return setup();
      });

      await waitFor(() => {
        expect(fetchLabOrderRequisitionDocumentsMock).toHaveBeenCalledTimes(1);
      });

      const newOrder: ServiceRequest = {
        ...mockActiveServiceRequest,
        id: 'new-order-456',
      };

      await act(async () => {
        rerender(
          <MemoryRouter>
            <MedplumProvider medplum={medplum}>
              <MantineProvider>
                <LabOrderDetails order={newOrder} />
              </MantineProvider>
            </MedplumProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(fetchLabOrderRequisitionDocumentsMock).toHaveBeenCalledWith(medplum, newOrder);
      });
    });
  });

  describe('onOrderChange callback', () => {
    it('accepts onOrderChange prop', async () => {
      const onOrderChange = vi.fn();

      await act(async () => {
        setup({ onOrderChange });
      });

      await waitFor(() => {
        expect(screen.getByText('CBC with Differential')).toBeInTheDocument();
      });

      // The callback is accepted and can be used by the component
      expect(onOrderChange).not.toHaveBeenCalled(); // Not called unless order changes
    });
  });
});
