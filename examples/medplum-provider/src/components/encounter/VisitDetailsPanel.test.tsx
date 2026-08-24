// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { PatchOperation, WithId } from '@medplum/core';
import type { Encounter, Organization, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { VisitDetailsPanel } from './VisitDetailsPanel';

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
  period: {
    start: '2024-01-01T10:00:00Z',
    end: '2024-01-01T11:00:00Z',
  },
  subject: { reference: 'Patient/patient-123' },
};

const mockPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['Dr.'], family: 'Test' }],
};

describe('VisitDetailsPanel', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
  });

  const setup = (props: Partial<Parameters<typeof VisitDetailsPanel>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <VisitDetailsPanel
              encounter={mockEncounter}
              onEncounterChange={vi.fn()}
              onBillingOrganizationChange={vi.fn()}
              {...props}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders visit details title', () => {
    setup();

    expect(screen.getByText('Visit Details')).toBeInTheDocument();
  });

  test('renders practitioner input', () => {
    setup();

    expect(screen.getByText(/Practitioner/i)).toBeInTheDocument();
  });

  test('renders check in date input', () => {
    setup();

    expect(screen.getByLabelText(/Check in/i)).toBeInTheDocument();
  });

  test('renders check out date input', () => {
    setup();

    expect(screen.getByLabelText(/Check out/i)).toBeInTheDocument();
  });

  test('calls onEncounterChange when practitioner is changed', async () => {
    const onEncounterChange = vi.fn();

    const mockPractitioner1: Practitioner = {
      resourceType: 'Practitioner',
      id: 'practitioner-1',
      name: [{ given: ['Dr.'], family: 'Test' }],
    };

    const mockPractitioner2: Practitioner = {
      resourceType: 'Practitioner',
      id: 'practitioner-2',
      name: [{ given: ['Dr.'], family: 'Smith' }],
    };

    await medplum.createResource(mockPractitioner1);
    await medplum.createResource(mockPractitioner2);

    // Mock search to return practitioners
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockPractitioner1, mockPractitioner2] as any);

    // Start without a practitioner selected so ResourceInput shows a searchbox
    setup({ onEncounterChange });

    await waitFor(() => {
      expect(screen.getByText(/Practitioner/i)).toBeInTheDocument();
    });

    // Find the ResourceInput searchbox (ResourceInput uses AsyncAutocomplete which renders a searchbox)
    await waitFor(
      () => {
        const searchbox = screen.queryByPlaceholderText('Search for practitioner');
        expect(searchbox).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const practitionerInput = screen.getByPlaceholderText('Search for practitioner');

    // Type to search for a practitioner using fireEvent.change (like PlanDefinitionBuilder)
    await act(async () => {
      fireEvent.change(practitionerInput, { target: { value: 'Smith' } });
    });

    // Wait for search to be called
    await waitFor(
      () => {
        expect(medplum.searchResources).toHaveBeenCalledWith(
          'Practitioner',
          expect.any(URLSearchParams),
          expect.any(Object)
        );
      },
      { timeout: 3000 }
    );

    // Wait for the dropdown option to appear and click it (like PlanDefinitionBuilder)
    // The display string for Practitioner is typically "Dr. Smith" or just "Smith"
    await waitFor(
      () => {
        const smithOption = screen.queryByText(/Smith/i);
        expect(smithOption).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await act(async () => {
      const smithOption = screen.getByText(/Smith/i);
      fireEvent.click(smithOption);
    });

    // Verify onEncounterChange was called with a participant patch
    await waitFor(
      () => {
        expect(onEncounterChange).toHaveBeenCalled();
        const call = onEncounterChange.mock.calls[onEncounterChange.mock.calls.length - 1];
        const ops = call[0] as PatchOperation[];
        expect(ops).toEqual([
          {
            op: 'add',
            path: '/participant',
            value: [{ individual: expect.objectContaining({ reference: 'Practitioner/practitioner-2' }) }],
          },
        ]);
      },
      { timeout: 5000 }
    );
  });

  test('calls onBillingOrganizationChange when billing organization is changed', async () => {
    const onBillingOrganizationChange = vi.fn();

    const mockOrganization: Organization = {
      resourceType: 'Organization',
      id: 'org-1',
      name: 'Test Medical Practice',
      identifier: [{ system: 'http://hl7.org/fhir/sid/us-npi', value: '3564119220' }],
    };

    await medplum.createResource(mockOrganization);

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockOrganization] as any);

    setup({ onBillingOrganizationChange });

    await waitFor(
      () => {
        expect(screen.queryByPlaceholderText('Search for organization')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const organizationInput = screen.getByPlaceholderText('Search for organization');

    await act(async () => {
      fireEvent.change(organizationInput, { target: { value: 'Test Medical' } });
    });

    // The search is restricted to provider organizations that have an NPI identifier
    await waitFor(
      () => {
        expect(medplum.searchResources).toHaveBeenCalledWith(
          'Organization',
          expect.any(URLSearchParams),
          expect.any(Object)
        );
        const calls = (medplum.searchResources as ReturnType<typeof vi.fn>).mock.calls;
        const orgCall = calls.find((call) => call[0] === 'Organization');
        const params = orgCall?.[1] as URLSearchParams;
        expect(params.get('identifier')).toBe('http://hl7.org/fhir/sid/us-npi|');
        expect(params.get('type')).toBe('http://terminology.hl7.org/CodeSystem/organization-type|prov');
      },
      { timeout: 3000 }
    );

    // Dropdown options show the organization name and its NPI
    await waitFor(
      () => {
        expect(screen.queryByText(/Test Medical Practice/i)).toBeInTheDocument();
        expect(screen.queryByText(/NPI 3564119220/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await act(async () => {
      fireEvent.click(screen.getByText(/Test Medical Practice/i));
    });

    await waitFor(
      () => {
        expect(onBillingOrganizationChange).toHaveBeenCalled();
        const call = onBillingOrganizationChange.mock.calls[onBillingOrganizationChange.mock.calls.length - 1];
        expect((call[0] as Organization).id).toBe('org-1');
      },
      { timeout: 5000 }
    );
  });

  test('displays the default billing organization', async () => {
    await medplum.createResource<Organization>({
      resourceType: 'Organization',
      id: 'org-default',
      name: 'Default Billing Org',
    });

    setup({ billingOrganization: { reference: 'Organization/org-default' } });

    await waitFor(() => {
      expect(screen.getByText('Default Billing Org')).toBeInTheDocument();
    });
  });

  test('calls onEncounterChange when check in time is changed', async () => {
    const user = userEvent.setup();
    const onEncounterChange = vi.fn();
    setup({ onEncounterChange });

    const checkinInput = screen.getByLabelText(/Check in/i);
    await user.clear(checkinInput);
    await user.type(checkinInput, '2024-01-02T10:00:00Z');

    await waitFor(() => {
      expect(onEncounterChange).toHaveBeenCalled();
    });
  });

  test('calls onEncounterChange when check out time is changed', async () => {
    const user = userEvent.setup();
    const onEncounterChange = vi.fn();
    setup({ onEncounterChange });

    const checkoutInput = screen.getByLabelText(/Check out/i);
    await user.clear(checkoutInput);
    await user.type(checkoutInput, '2024-01-02T11:00:00Z');

    await waitFor(() => {
      expect(onEncounterChange).toHaveBeenCalled();
    });
  });

  test('displays default practitioner value', async () => {
    await medplum.createResource(mockPractitioner);
    setup({ practitioner: mockPractitioner });

    await waitFor(() => {
      expect(screen.getByText(/Practitioner/i)).toBeInTheDocument();
      expect(screen.getByText(/Dr\. Test/i)).toBeInTheDocument();
    });
  });

  test('displays default check in time', () => {
    setup();

    const checkinInput = screen.getByLabelText(/Check in/i);
    // DateTimeInput may display in local or UTC; assert the value contains the date
    const value = (checkinInput as HTMLInputElement).value;
    expect(value).toMatch(/2024-01-01/);
    expect(value).toBeTruthy();
  });

  test('displays default check out time', () => {
    setup();

    const checkoutInput = screen.getByLabelText(/Check out/i);
    const value = (checkoutInput as HTMLInputElement).value;
    expect(value).toMatch(/2024-01-01/);
    expect(value).toBeTruthy();
  });
});
