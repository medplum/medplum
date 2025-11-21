// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import type { ChargeItem, Claim, Condition, Coverage, Encounter, Patient, Practitioner } from '@medplum/fhirtypes';
import { HomerSimpson, DrAliceSmith, MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BillingTab } from './BillingTab';
import { showErrorNotification } from '../../utils/notifications';
import { createSelfPayCoverage } from '../../utils/coverage';
import { OperationOutcomeError } from '@medplum/core';

vi.mock('../../utils/notifications');
vi.mock('../../utils/coverage');
vi.mock('../../utils/claims');
vi.mock('../../hooks/useDebouncedUpdateResource', () => ({
  useDebouncedUpdateResource: () => vi.fn(),
}));
vi.mock('../ChargeItem/ChargeItemList', () => ({
  ChargeItemList: ({ chargeItems }: { chargeItems: ChargeItem[] }) => (
    <div data-testid="charge-item-list">{chargeItems.length} items</div>
  ),
}));
vi.mock('../Conditions/ConditionList', () => ({
  ConditionList: ({ conditions }: { conditions: Condition[] }) => (
    <div data-testid="condition-list">{conditions.length} conditions</div>
  ),
}));

const mockPatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockEncounter: Encounter = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'finished',
  class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
  subject: { reference: 'Patient/patient-123' },
  participant: [
    {
      individual: { reference: 'Practitioner/practitioner-123' },
    },
  ],
};

const mockCoverage: Coverage = {
  resourceType: 'Coverage',
  id: 'coverage-123',
  status: 'active',
  beneficiary: { reference: 'Patient/patient-123' },
  payor: [{ reference: 'Organization/organization-123' }],
};

const mockPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['Dr.'], family: 'Test' }],
};

const mockChargeItem: ChargeItem = {
  resourceType: 'ChargeItem',
  id: 'charge-123',
  status: 'billable',
  subject: { reference: 'Patient/patient-123' },
  code: { text: 'Test Charge' },
};

const mockClaim: Claim = {
  resourceType: 'Claim',
  id: 'claim-123',
  status: 'active',
  type: { coding: [{ code: 'professional' }] },
  use: 'claim',
  created: new Date().toISOString(),
  priority: { coding: [{ code: 'normal' }] },
  insurance: [],
  patient: { reference: 'Patient/patient-123' },
  provider: { reference: 'Practitioner/practitioner-123' },
};

describe('BillingTab', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    await medplum.createResource(HomerSimpson);
    await medplum.createResource(DrAliceSmith);
    vi.clearAllMocks();
  });

  const setup = (props: Partial<Parameters<typeof BillingTab>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <BillingTab
              patient={mockPatient}
              encounter={mockEncounter}
              setEncounter={vi.fn()}
              practitioner={mockPractitioner}
              setPractitioner={vi.fn()}
              chargeItems={[]}
              setChargeItems={vi.fn()}
              claim={undefined}
              setClaim={vi.fn()}
              {...props}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  it('renders visit details panel', () => {
    setup();

    expect(screen.getByText('Visit Details')).toBeInTheDocument();
  });

  it('renders condition list', () => {
    setup();

    expect(screen.getByTestId('condition-list')).toBeInTheDocument();
  });

  it('renders charge item list when charge items are provided', () => {
    setup({ chargeItems: [mockChargeItem] });

    expect(screen.getByTestId('charge-item-list')).toBeInTheDocument();
  });

  it('does not render export claim button when no claim', () => {
    setup({ claim: undefined });

    expect(screen.queryByText('Export Claim')).not.toBeInTheDocument();
  });

  it('renders export claim button when claim exists', () => {
    setup({ claim: mockClaim });

    expect(screen.getByText('Export Claim')).toBeInTheDocument();
  });

  it('shows export menu options when export button is clicked', async () => {
    const user = userEvent.setup();
    setup({ claim: mockClaim });

    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
      expect(screen.getByText('EDI X12')).toBeInTheDocument();
      expect(screen.getByText('NUCC Crosswalk CSV')).toBeInTheDocument();
    });
  });

  it('exports claim as CMS 1500 when option is selected', async () => {
    const user = userEvent.setup();
   

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockCoverage] as any);
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    } as any);

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    setup({ claim: mockClaim });

    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
    });

    await user.click(screen.getByText('CMS 1500 Form'));

    await waitFor(() => {
      expect(medplum.post).toHaveBeenCalled();
      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/claim.pdf', '_blank');
    });

    windowOpenSpy.mockRestore();
  });

  it('creates self-pay coverage when no coverage exists', async () => {
    const user = userEvent.setup();
    const mockSelfPayCoverage: Coverage = {
      resourceType: 'Coverage',
      id: 'self-pay-123',
      status: 'active',
      beneficiary: { reference: 'Patient/patient-123' },
      payor: [{ reference: 'Organization/organization-123' }],
    };

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.mocked(createSelfPayCoverage).mockResolvedValue(mockSelfPayCoverage);
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    } as any);

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    setup({ claim: mockClaim });

    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
    });

    await user.click(screen.getByText('CMS 1500 Form'));

    await waitFor(() => {
      expect(createSelfPayCoverage).toHaveBeenCalledWith(medplum, 'patient-123');
    });

    windowOpenSpy.mockRestore();
  });

  it('handles export error gracefully', async () => {
    const user = userEvent.setup();
    const error = new OperationOutcomeError({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', diagnostics: 'Bad Request' }],
    });
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.mocked(createSelfPayCoverage).mockResolvedValue({
      resourceType: 'Coverage',
      id: 'coverage-123',
      status: 'active',
      beneficiary: { reference: 'Patient/patient-123' },
      payor: [{ reference: 'Organization/organization-123' }],
    } as Coverage);
    const postSpy = vi.spyOn(medplum, 'post').mockRejectedValue(error);

    // Set up handler to catch unhandled rejection
    let caughtError: Error | undefined;
    const rejectionHandler = (reason: unknown): void => {
      caughtError = reason as Error;
    };
    process.on('unhandledRejection', rejectionHandler);

    try {
      setup({ claim: mockClaim });

      const exportButton = screen.getByText('Export Claim');
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
      });

      await user.click(screen.getByText('CMS 1500 Form'));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalled();
      });

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 100);
      });

      expect(caughtError).toBe(error);
    } finally {
      process.removeListener('unhandledRejection', rejectionHandler);
    }
  });

  it('renders request billing service button', () => {
    setup({ claim: mockClaim });

    expect(screen.getByText('Request to connect a billing service')).toBeInTheDocument();
  });

  it('fetches coverage on mount', async () => {

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockCoverage] as any);

    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(medplum.searchResources).toHaveBeenCalledWith(
        'Coverage',
        expect.stringContaining('patient=Patient/patient-123')
      );
    });
  });

  it('handles coverage fetch error', async () => {
    const error = new Error('Failed to fetch coverage');
    vi.spyOn(medplum, 'searchResources').mockRejectedValue(error);

    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalledWith(error);
    });
  });
});

