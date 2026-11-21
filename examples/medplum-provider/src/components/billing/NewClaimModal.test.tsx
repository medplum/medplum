// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Claim, Encounter } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NewClaimModal } from './NewClaimModal';
import { render } from '../../test-utils/render';

describe('NewClaimModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  const createEncounter = (start: string): Promise<WithId<Encounter>> =>
    medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB', display: 'ambulatory' },
      serviceType: { text: 'Follow-up' },
      period: { start },
      subject: createReference(HomerSimpson),
      participant: [{ individual: createReference(DrAliceSmith) }],
    });

  const setup = (): ReturnType<typeof vi.fn> => {
    const onCreated = vi.fn();
    render(
      <MedplumProvider medplum={medplum}>
          <Notifications />
          <MemoryRouter>
            <NewClaimModal opened onClose={vi.fn()} onCreated={onCreated} />
          </MemoryRouter>
      </MedplumProvider>
    );
    return onCreated;
  };

  const pickPatient = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.type(screen.getByPlaceholderText('Search patients'), 'Homer');
    await user.click(await screen.findByText('Homer Simpson'));
  };

  test('creates a claim from the chosen encounter', async () => {
    const encounter = await createEncounter('2026-10-01T10:00:00Z');
    const user = userEvent.setup();
    const onCreated = setup();

    expect(screen.getByRole('button', { name: 'Create claim' })).toBeDisabled();
    await pickPatient(user);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create claim' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Create claim' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const claim = onCreated.mock.calls[0][0] as WithId<Claim>;
    expect(claim.status).toBe('draft');
    expect(claim.patient?.reference).toBe(`Patient/${HomerSimpson.id}`);
    expect(claim.id).toBeDefined();
    expect(encounter.id).toBeDefined();
  });

  test('makes a related claim for an encounter that already has one', async () => {
    const encounter = await createEncounter('2026-10-02T10:00:00Z');
    const existing = await medplum.createResource<Claim>({
      resourceType: 'Claim',
      status: 'draft',
      use: 'claim',
      created: '2026-10-02',
      type: { coding: [{ code: 'professional' }] },
      priority: { coding: [{ code: 'normal' }] },
      provider: createReference(DrAliceSmith),
      patient: createReference(HomerSimpson),
      insurance: [],
      item: [{ sequence: 1, productOrService: {}, encounter: [createReference(encounter)] }],
    });
    const user = userEvent.setup();
    const onCreated = setup();

    await pickPatient(user);
    const select = screen.getByRole('textbox', { name: 'Encounter' });
    await waitFor(() => expect((select as HTMLInputElement).value).toMatch(/has a claim/));
    expect(screen.getByText(/already has a claim/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create related claim' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const created = onCreated.mock.calls[0][0] as WithId<Claim>;
    expect(created.id).not.toBe(existing.id);
    expect(created.related?.[0].claim?.reference).toBe(`Claim/${existing.id}`);
  });
});
