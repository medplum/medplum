// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
import type { AccessPolicy, ProjectMembership } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { render } from '../test-utils/render';
import { ExplorerPage } from './ExplorerPage';

window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));
window.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

const broad: AccessPolicy = {
  resourceType: 'AccessPolicy',
  name: 'Broad',
  resource: [{ resourceType: 'Patient' }],
};

const strict: AccessPolicy = {
  resourceType: 'AccessPolicy',
  name: 'Strict',
  resource: [
    { resourceType: 'Patient', hiddenFields: ['birthDate'] },
    { resourceType: 'Observation', criteria: 'Patient?name=x' },
  ],
};

describe('ExplorerPage', () => {
  test('loads a membership and shows how its policies interact', async () => {
    const medplum = new MockClient();
    const [broadPolicy, strictPolicy] = await Promise.all([
      medplum.createResource(broad),
      medplum.createResource(strict),
    ]);
    const membership = await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/123' },
      user: { reference: 'User/123' },
      profile: { reference: 'Practitioner/123', display: 'Dr. Explorer' },
      access: [
        { policy: { reference: `AccessPolicy/${broadPolicy.id}` } },
        { policy: { reference: `AccessPolicy/${strictPolicy.id}` } },
      ],
    });
    vi.spyOn(medplum, 'searchResources').mockResolvedValue(Object.assign([membership], { bundle: {} }) as never);

    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ExplorerPage />
        </MedplumProvider>
      </MemoryRouter>
    );

    const picker = await screen.findByPlaceholderText('Search 1 memberships');
    await act(async () => {
      fireEvent.click(picker);
    });
    const option = await screen.findByText('Dr. Explorer (Practitioner/123)');
    await act(async () => {
      fireEvent.click(option);
    });

    expect(await screen.findByText('1. Broad')).toBeInTheDocument();
    expect(screen.getByText('2. Strict')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Practitioner/123')).toBeInTheDocument();
    expect(screen.getByText('never used')).toBeInTheDocument();

    // The merged policy as raw JSON
    await act(async () => {
      fireEvent.click(screen.getByText('JSON'));
    });
    expect(screen.getByText(/"hiddenFields": \[\s*"birthDate"/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('Table'));
    });

    // Editing a policy's JSON re-runs the analysis: removing Broad's Patient entry un-shadows Strict's.
    await act(async () => {
      fireEvent.click(screen.getAllByText('Show JSON')[0]);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Broad JSON'), {
        target: { value: JSON.stringify({ ...broad, resource: [] }) },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Apply edits'));
    });
    expect(screen.getByText(/edited here, not saved/)).toBeInTheDocument();
    expect(screen.queryByText('never used')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('Revert edits'));
    });
    expect(screen.getByText('never used')).toBeInTheDocument();

    // A pasted sample switches the selected type to match, then is evaluated once its search parameters load
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Which entry wins' }));
    });
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Patient'), { target: { value: 'Encounter' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Sample resource JSON'), {
        target: { value: JSON.stringify({ resourceType: 'Patient', id: '1' }) },
      });
    });
    expect(screen.getByDisplayValue('Patient')).toBeInTheDocument();
    expect(await screen.findByText('Clear sample')).toBeInTheDocument();
    expect(screen.getByText('wins')).toBeInTheDocument();
    expect(screen.getByText('shadowed')).toBeInTheDocument();

    // The sample is kept when switching tabs
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Matrix' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Which entry wins' }));
    });
    expect(await screen.findByText('Clear sample')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Field surprises/ }));
    });
    expect(screen.getAllByText('always skipped').length).toBeGreaterThan(0);
    expect(screen.getAllByText('birthDate').length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Search scope' }));
    });
    expect(screen.getByText('every search fails (403)')).toBeInTheDocument();
  });
});
