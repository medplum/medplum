import { DiagnosticReport, ServiceRequest } from '@medplum/fhirtypes';
import { HomerDiagnosticReport, HomerServiceRequest, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { Labs } from './Labs';

const medplum = new MockClient();

describe('PatientSummary - Labs', () => {
  async function setup(children: ReactNode): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty', async () => {
    await setup(<Labs patient={HomerSimpson} serviceRequests={[]} diagnosticReports={[]} />);
    expect(screen.getByText('Labs')).toBeInTheDocument();
  });

  test('Renders ServiceRequest', async () => {
    const mockOnClickResource = jest.fn();
    await setup(
      <Labs
        patient={HomerSimpson}
        serviceRequests={[HomerServiceRequest]}
        diagnosticReports={[]}
        onClickResource={mockOnClickResource}
      />
    );
    expect(screen.getByText('active')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('SERVICE_REQUEST_CODE'));
    });
    expect(mockOnClickResource).toHaveBeenCalled();
  });

  test('Renders DiagnosticReport', async () => {
    await setup(<Labs patient={HomerSimpson} serviceRequests={[]} diagnosticReports={[HomerDiagnosticReport]} />);
    expect(screen.getByText('final')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('Test Report'));
    });

    const modalTitle = await screen.findByText('Diagnostic Report');
    expect(modalTitle).toBeInTheDocument();
  });

  test('Status Badge colors', async () => {
    const requests: ServiceRequest[] = [
      {
        resourceType: 'ServiceRequest',
        status: 'active',
        code: { text: 'Test Request Active' },
        intent: 'order',
        subject: {
          reference: 'Patient/123',
        },
      }
    ];

    const reports: DiagnosticReport[] = [
      {
        resourceType: 'DiagnosticReport',
        status: 'final',
        code: { text: 'Test Report Final' },
      },
      {
        resourceType: 'DiagnosticReport',
        status: 'cancelled',
        code: { text: 'Test Report Cancelled' },
      },
      {
        resourceType: 'DiagnosticReport',
        status: 'preliminary',
        code: { text: 'Test Report Preliminary' },
      }
    ];
    await setup(<Labs patient={HomerSimpson} serviceRequests={requests} diagnosticReports={reports} />);

    const activeBadge = screen.getByText('active').closest('[class*="mantine-Badge-root"]');
    expect(activeBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-indigo-light-color)' });

    const cancelledBadge = screen.getByText('cancelled').closest('[class*="mantine-Badge-root"]');
    expect(cancelledBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-red-light-color)' });

    const preliminaryBadge = screen.getByText('preliminary').closest('[class*="mantine-Badge-root"]');
    expect(preliminaryBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-gray-light-color)' });

    const finalBadge = screen.getByText('final').closest('[class*="mantine-Badge-root"]');
    expect(finalBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-teal-light-color)' });
  });
});
