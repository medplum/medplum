// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { notifications } from '@mantine/notifications';
import type { ResourceArray, WithId } from '@medplum/core';
import type { Bot, Bundle, Coverage, CoverageEligibilityRequest, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '../../test-utils/render';
import { CoveragePage } from './CoveragePage';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useParams: () => ({ patientId: 'patient-123', coverageId: 'coverage-456' }),
    useNavigate: () => vi.fn(),
  };
});

/**
 * Build a ResourceArray (array + bundle) from a list of resources — avoids `as any` in mocks.
 * @param resources - The resources to include in the array.
 * @returns A ResourceArray containing the provided resources and a matching Bundle.
 */
function makeResourceArray<T extends Resource>(resources: WithId<T>[]): ResourceArray<WithId<T>> {
  const bundle: Bundle<WithId<T>> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: resources.map((resource) => ({ resource })),
  };
  return Object.assign([...resources], { bundle }) as ResourceArray<WithId<T>>;
}

const mockCoverage: WithId<Coverage> = {
  resourceType: 'Coverage',
  id: 'coverage-456',
  status: 'active',
  beneficiary: { reference: 'Patient/patient-123' },
  payor: [{ display: 'United Healthcare' }],
  subscriberId: 'SUB-001',
  period: { start: '2026-01-01', end: '2026-12-31' },
};

const mockRequest: WithId<CoverageEligibilityRequest> = {
  resourceType: 'CoverageEligibilityRequest',
  id: 'req-1',
  status: 'active',
  purpose: ['benefits'],
  created: '2026-01-15T10:00:00Z',
  patient: { reference: 'Patient/patient-123' },
  insurer: { display: 'United Healthcare', reference: 'Organization/org-1' },
  insurance: [{ focal: true, coverage: { reference: 'Coverage/coverage-456' } }],
};

const mockBot: WithId<Bot> = {
  resourceType: 'Bot',
  id: 'bot-1',
  name: 'Eligibility Bot',
};

function setup(medplum: MockClient): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <CoveragePage />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('CoveragePage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    medplum = new MockClient();
    vi.spyOn(medplum, 'readResource').mockResolvedValue(mockCoverage);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue(makeResourceArray([]));
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
  });

  describe('coverage summary', () => {
    test('renders payor name from coverage', async () => {
      setup(medplum);
      await waitFor(() => expect(screen.getByText('United Healthcare')).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText(/SUB-001/)).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText('active')).toBeInTheDocument());
      await waitFor(() => expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeInTheDocument());
   
    });

  });

  describe('eligibility request list', () => {
    test('shows empty state when no requests found', async () => {
      setup(medplum);
      await waitFor(() =>
        expect(screen.getByText('No eligibility checks found for this coverage.')).toBeInTheDocument()
      );
    });

    test('renders eligibility request items', async () => {
      vi.spyOn(medplum, 'searchResources').mockResolvedValue(makeResourceArray([mockRequest]));
      setup(medplum);
      await waitFor(() => expect(screen.getByText('Benefits')).toBeInTheDocument());
    });

    test('renders empty state when requests exist but none match this coverage', async () => {
      const otherRequest: WithId<CoverageEligibilityRequest> = {
        ...mockRequest,
        insurance: [{ focal: true, coverage: { reference: 'Coverage/other-coverage' } }],
      };
      vi.spyOn(medplum, 'searchResources').mockResolvedValue(makeResourceArray([otherRequest]));
      setup(medplum);
      await waitFor(() =>
        expect(screen.getByText('No eligibility checks found for this coverage.')).toBeInTheDocument()
      );
    });
  });

  describe('right panel', () => {
    test('shows prompt to select a check when no request is selected', async () => {
      setup(medplum);
      await waitFor(() =>
        expect(screen.getByText('Select an eligibility check to view details.')).toBeInTheDocument()
      );
    });
  });

  describe('Check Eligibility button', () => {
    test('shows error notification when bot is not available', async () => {
      vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
      setup(medplum);

      const button = await screen.findByRole('button', { name: 'Check Eligibility' });
      button.click();

      await waitFor(() =>
        expect(notifications.show).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'To enable Insurance Eligibility please contact support.',
          })
        )
      );
    });

    test('shows error notification when no PractitionerRole found', async () => {
      vi.spyOn(medplum, 'searchOne')
        .mockResolvedValueOnce(mockBot)   // Bot lookup
        .mockResolvedValueOnce(undefined); // PractitionerRole lookup
      setup(medplum);

      const button = await screen.findByRole('button', { name: 'Check Eligibility' });
      button.click();

      await waitFor(() =>
        expect(notifications.show).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'No PractitionerRole found for the assigned practitioner.',
          })
        )
      );
    });
  });
});
