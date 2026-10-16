// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { createReference, formatSearchQuery } from '@medplum/core';
import type {
  Coverage,
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  Patient,
  PractitionerRole,
} from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient, TestOrganization } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { RenderResult } from '../../test-utils/render';
import { render, screen, userEvent, waitFor } from '../../test-utils/render';
import { CoveragePage } from './CoveragePage';

const QUERY = formatSearchQuery({
  resourceType: 'CoverageEligibilityRequest',
  sortRules: [{ code: '_lastUpdated', descending: true }],
  count: 20,
  offset: 0,
  total: 'accurate',
});

function mockSubmit(medplum: MockClient, result: () => Promise<unknown>): ReturnType<typeof vi.spyOn> {
  const original = medplum.post.bind(medplum);
  return vi.spyOn(medplum, 'post').mockImplementation((url, ...rest) => {
    if (url.toString().endsWith('$submit')) {
      return result();
    }
    return original(url, ...rest);
  });
}

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe('CoveragePage', () => {
  let medplum: MockClient;
  let patient: WithId<Patient>;
  let uhc: WithId<Coverage>;
  let bcbs: WithId<Coverage>;

  beforeEach(async () => {
    vi.clearAllMocks();
    notifications.clean();
    notifications.cleanQueue();
    medplum = new MockClient();
    patient = HomerSimpson as WithId<Patient>;
    uhc = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: createReference(patient),
      payor: [{ ...createReference(TestOrganization), display: 'United Healthcare' }],
      subscriberId: 'UHC-SUB-001',
    });
    bcbs = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: createReference(patient),
      payor: [{ display: 'Blue Cross Blue Shield' }],
    });
  });

  async function createRequest(
    coverage: WithId<Coverage>,
    props?: Partial<CoverageEligibilityRequest>
  ): Promise<WithId<CoverageEligibilityRequest>> {
    return medplum.createResource<CoverageEligibilityRequest>({
      resourceType: 'CoverageEligibilityRequest',
      status: 'active',
      purpose: ['benefits'],
      created: '2026-01-15T10:00:00Z',
      patient: createReference(patient),
      insurer: createReference(TestOrganization),
      insurance: [{ focal: true, coverage: createReference(coverage) }],
      ...props,
    });
  }

  async function createPractitionerRole(): Promise<WithId<PractitionerRole>> {
    return medplum.createResource<PractitionerRole>({
      resourceType: 'PractitionerRole',
      practitioner: createReference(DrAliceSmith),
      organization: createReference(TestOrganization),
    });
  }

  function renderAt(path: string): RenderResult {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <MedplumProvider medplum={medplum}>
          <Notifications />
          <Routes>
            <Route path="/Patient/:patientId/Coverage" element={<CoveragePage />} />
            <Route path="/Patient/:patientId/Coverage/:coverageId" element={<CoveragePage />} />
            <Route
              path="/Patient/:patientId/Coverage/:coverageId/CoverageEligibilityRequest/:requestId"
              element={<CoveragePage />}
            />
          </Routes>
          <LocationProbe />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  function setup(coverageId?: string, requestId?: string, query: string = QUERY): RenderResult {
    let path = `/Patient/${patient.id}/Coverage`;
    if (coverageId) {
      path += `/${coverageId}`;
    }
    if (coverageId && requestId) {
      path += `/CoverageEligibilityRequest/${requestId}`;
    }
    return renderAt(`${path}${query}`);
  }

  async function openCheckModal(): Promise<void> {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Check eligibility' }));
    await screen.findByRole('dialog');
  }

  describe('eligibility request list', () => {
    test('Lists every eligibility request of the patient regardless of coverage', async () => {
      await createRequest(uhc, { purpose: ['benefits'] });
      await createRequest(bcbs, { purpose: ['discovery'] });
      setup(uhc.id);

      expect(await screen.findByText('Benefits')).toBeInTheDocument();
      expect(screen.getByText('Discovery')).toBeInTheDocument();
    });

    test('Excludes requests of other patients', async () => {
      const other = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Other' }] });
      await createRequest(uhc, { purpose: ['benefits'] });
      await createRequest(uhc, { purpose: ['discovery'], patient: createReference(other) });
      setup(uhc.id);

      expect(await screen.findByText('Benefits')).toBeInTheDocument();
      expect(screen.queryByText('Discovery')).not.toBeInTheDocument();
    });

    test('Shows the empty state when the patient has no requests', async () => {
      setup(uhc.id);

      expect(await screen.findByText('No eligibility checks found.')).toBeInTheDocument();
    });

    test('Pins the default search into the URL', async () => {
      setup(uhc.id, undefined, '');

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(QUERY));
      expect(screen.getByTestId('location')).toHaveTextContent(`/Patient/${patient.id}/Coverage/${uhc.id}`);
    });

    test('Passes explicit _sort and _count from the URL through to the search', async () => {
      const searchSpy = vi.spyOn(medplum, 'search');
      setup(uhc.id, undefined, '?_count=10&_sort=created');

      await waitFor(() =>
        expect(searchSpy).toHaveBeenCalledWith(
          'CoverageEligibilityRequest',
          expect.stringContaining('_count=10'),
          expect.anything()
        )
      );
      expect(searchSpy).toHaveBeenCalledWith(
        'CoverageEligibilityRequest',
        expect.stringContaining('_sort=created'),
        expect.anything()
      );
    });

    test('Links each request to its detail route with the current query', async () => {
      const request = await createRequest(uhc);
      setup(uhc.id);

      const link = (await screen.findByText('Benefits')).closest('a');
      expect(link).toHaveAttribute(
        'href',
        `/Patient/${patient.id}/Coverage/${uhc.id}/CoverageEligibilityRequest/${request.id}${QUERY}`
      );
    });

    test('Links a request through its own coverage when none is selected', async () => {
      const request = await createRequest(bcbs);
      setup();

      const link = (await screen.findByText('Benefits')).closest('a');
      expect(link).toHaveAttribute(
        'href',
        `/Patient/${patient.id}/Coverage/${bcbs.id}/CoverageEligibilityRequest/${request.id}${QUERY}`
      );
    });

    test('Navigates to the next page with the new offset', async () => {
      const user = userEvent.setup();
      for (let i = 0; i < 3; i++) {
        await createRequest(uhc);
      }
      setup(uhc.id, undefined, '?_count=2');

      const requestPath = `/Patient/${patient.id}/Coverage/${uhc.id}/CoverageEligibilityRequest/`;
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(requestPath));
      await user.click(await screen.findByRole('button', { name: '2' }));

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('_offset=2'));
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(requestPath));
    });
  });

  describe('detail pane', () => {
    test('Prompts to select a check when the patient has no requests', async () => {
      setup(uhc.id);

      expect(await screen.findByText('Select an eligibility check to view details.')).toBeInTheDocument();
    });

    test('Selects the first request when none is selected', async () => {
      const request = await createRequest(uhc);
      setup(uhc.id);

      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent(
          `/Patient/${patient.id}/Coverage/${uhc.id}/CoverageEligibilityRequest/${request.id}${QUERY}`
        )
      );
      expect(await screen.findByText('Eligibility Request')).toBeInTheDocument();
    });

    test('Selects the first request through its own coverage when no coverage is in the URL', async () => {
      const request = await createRequest(bcbs);
      setup();

      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent(
          `/Patient/${patient.id}/Coverage/${bcbs.id}/CoverageEligibilityRequest/${request.id}${QUERY}`
        )
      );
    });

    test('Shows the eligibility details for the selected request', async () => {
      const request = await createRequest(uhc);
      await medplum.createResource<CoverageEligibilityResponse>({
        resourceType: 'CoverageEligibilityResponse',
        status: 'active',
        purpose: ['benefits'],
        patient: createReference(patient),
        created: '2026-01-15T10:05:00Z',
        insurer: createReference(TestOrganization),
        outcome: 'complete',
        request: createReference(request),
      });
      setup(uhc.id, request.id);

      expect(await screen.findByText('Eligibility Request')).toBeInTheDocument();
      expect(await screen.findByText('Complete')).toBeInTheDocument();
    });
  });

  describe('Check eligibility', () => {
    test('Opens the modal from the header with the URL coverage preselected', async () => {
      setup(uhc.id);
      await openCheckModal();

      expect(await screen.findByDisplayValue('United Healthcare · UHC-SUB-001')).toBeInTheDocument();
    });

    test('Uses the practitioner as provider when the current user has no PractitionerRole', async () => {
      const user = userEvent.setup();
      const createSpy = vi.spyOn(medplum, 'createResource');
      mockSubmit(medplum, () => Promise.resolve({}));
      setup(uhc.id);
      await openCheckModal();

      await screen.findByDisplayValue('United Healthcare · UHC-SUB-001');
      await screen.findByRole('searchbox');
      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'CoverageEligibilityRequest',
            provider: createReference(DrAliceSmith),
          })
        )
      );
    });

    test('Creates the request against the chosen coverage, submits it, and selects it', async () => {
      const user = userEvent.setup();
      await createPractitionerRole();
      const createSpy = vi.spyOn(medplum, 'createResource');
      const postSpy = mockSubmit(medplum, () => Promise.resolve({}));
      setup(uhc.id);
      await openCheckModal();

      await user.click(await screen.findByDisplayValue('United Healthcare · UHC-SUB-001'));
      await user.click(await screen.findByRole('option', { name: 'Blue Cross Blue Shield', hidden: true }));
      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'CoverageEligibilityRequest',
            purpose: ['benefits'],
            insurance: [{ focal: true, coverage: createReference(bcbs) }],
          })
        )
      );
      const saved = (await createSpy.mock.results[0].value) as WithId<CoverageEligibilityRequest>;
      await waitFor(() =>
        expect(postSpy).toHaveBeenCalledWith(medplum.fhirUrl('CoverageEligibilityRequest', saved.id, '$submit'))
      );
      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent(
          `/Patient/${patient.id}/Coverage/${bcbs.id}/CoverageEligibilityRequest/${saved.id}${QUERY}`
        )
      );
      expect(await screen.findByText('Eligibility Request')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('Still refreshes and selects the request when $submit fails', async () => {
      const user = userEvent.setup();
      await createPractitionerRole();
      mockSubmit(medplum, () => Promise.reject(new Error('Payer unavailable')));
      setup(uhc.id);
      await openCheckModal();

      await screen.findByDisplayValue('United Healthcare · UHC-SUB-001');
      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

      expect(await screen.findByText('Payer unavailable')).toBeInTheDocument();
      expect(await screen.findByText('Eligibility Request')).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent(
          `/Patient/${patient.id}/Coverage/${uhc.id}/CoverageEligibilityRequest/`
        )
      );
    });
  });
});
