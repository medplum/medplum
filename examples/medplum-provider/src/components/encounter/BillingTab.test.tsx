// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import type { ChargeItem, Claim, Coverage, Encounter, Patient, Practitioner } from '@medplum/fhirtypes';
import { HomerSimpson, DrAliceSmith, MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { BillingTab } from './BillingTab';

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
  subject: { reference: `Patient/${HomerSimpson.id}` },
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

  test('renders visit details panel', () => {
    setup();

    expect(screen.getByText('Visit Details')).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Test/i)).toBeInTheDocument();
  });

  test('renders condition list when there are conditions', async () => {
    const mockCondition = {
      resourceType: 'Condition' as const,
      id: 'condition-1',
      code: {
        coding: [{ code: 'R51', display: 'Headache' }],
        text: 'Headache',
      },
    };

    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockCondition as any);

    setup({
      encounter: {
        ...mockEncounter,
        diagnosis: [
          {
            condition: { reference: 'Condition/condition-1' },
          },
        ],
      },
    });

    expect(screen.getByText('Diagnosis')).toBeInTheDocument();
    expect(screen.getByText('Add Diagnosis')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Headache')).toBeInTheDocument();
    });
  });

  test('renders condition list when there are NO conditions', () => {
    setup({
      encounter: {
        ...mockEncounter,
        diagnosis: [],
      },
    });

    expect(screen.getByText('Diagnosis')).toBeInTheDocument();
    expect(screen.getByText('Add Diagnosis')).toBeInTheDocument();
    expect(screen.queryByText('Headache')).not.toBeInTheDocument();
  });

  test('renders charge item list when charge items are provided', () => {
    setup({ chargeItems: [mockChargeItem] });

    expect(screen.getByText('Charge Items')).toBeInTheDocument();
    expect(screen.getByText('Add Charge Item')).toBeInTheDocument();

    // Add assertions for specific charge item information
    if (mockChargeItem.code?.coding?.[0]?.display) {
      expect(screen.getByText(mockChargeItem.code.coding[0].display)).toBeInTheDocument();
    }
    if (mockChargeItem.code?.coding?.[0]?.code) {
      expect(screen.getByText(mockChargeItem.code.coding[0].code)).toBeInTheDocument();
    }
    if (mockChargeItem.quantity?.value !== undefined) {
      expect(screen.getByText(mockChargeItem.quantity.value.toString())).toBeInTheDocument();
    }
  });

  test('does not render export claim button when no claim', () => {
    setup({ claim: undefined });

    expect(screen.queryByText('Export Claim')).not.toBeInTheDocument();
  });

  test('renders export claim button when claim exists', () => {
    setup({ claim: mockClaim });

    expect(screen.getByText('Export Claim')).toBeInTheDocument();
  });

  test('shows export menu options when export button is clicked', async () => {
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

  test('exports claim as CMS 1500 when option is selected', async () => {
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

  test('renders request billing service button', () => {
    setup({ claim: mockClaim });
    expect(screen.getByText('Request to connect a billing service')).toBeInTheDocument();
  });

  test('fetches coverage on mount', async () => {
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
});
