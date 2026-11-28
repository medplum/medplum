// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT, createReference } from '@medplum/core';
import type { Claim, Encounter } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test } from 'vitest';
import { render } from '../../test-utils/render';
import { pinClaimEncounter } from './claimConditions';
import { RelatedClaims } from './RelatedClaims';

describe('RelatedClaims', () => {
  const setup = async (): Promise<{ visitClaim: WithId<Claim>; related: WithId<Claim>; medplum: MockClient }> => {
    const medplum = new MockClient();
    const encounter = await medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB' },
      subject: createReference(HomerSimpson),
    });
    const newClaim = (fields: Omit<Partial<Claim>, 'resourceType'>): Promise<WithId<Claim>> =>
      medplum.createResource<Claim>(
        pinClaimEncounter(
          {
            resourceType: 'Claim',
            status: 'draft',
            use: 'claim',
            type: { coding: [{ code: 'professional' }] },
            priority: { coding: [{ code: 'normal' }] },
            patient: createReference(HomerSimpson),
            provider: { reference: 'Practitioner/123' },
            insurance: [],
            created: new Date().toISOString(),
            ...fields,
          },
          createReference(encounter)
        )
      );
    const visitClaim = await newClaim({
      created: '2026-10-02',
      item: [{ sequence: 1, productOrService: { coding: [{ system: CPT, code: '99213' }] } }],
      total: { value: 150, currency: 'USD' },
    });
    const related = await newClaim({
      created: '2026-10-05',
      related: [{ claim: createReference(visitClaim) }],
    });
    return { visitClaim, related, medplum };
  };

  const renderFor = (medplum: MockClient, claim: WithId<Claim>): void => {
    render(
      <MemoryRouter initialEntries={[`/Billing/Claims/open/${claim.id}`]}>
        <MedplumProvider medplum={medplum}>
          <RelatedClaims claim={claim} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('lists the visit claim from a related claim, opening it in the same queue', async () => {
    const { visitClaim, related, medplum } = await setup();
    renderFor(medplum, related);

    const link = await screen.findByRole('link', { name: /^Claim ·/ });
    expect(link).toHaveAttribute('href', `/Billing/Claims/open/${visitClaim.id}`);
    expect(screen.getByText('99213 · $150.00')).toBeInTheDocument();
  });

  test('lists related claims from the visit claim', async () => {
    const { visitClaim, related, medplum } = await setup();
    renderFor(medplum, visitClaim);

    expect(await screen.findByRole('link', { name: /^Claim ·/ })).toHaveAttribute(
      'href',
      `/Billing/Claims/open/${related.id}`
    );
    expect(screen.getByText(/No service lines/)).toBeInTheDocument();
  });

  test('shows nothing for a claim with no other claims on its visit', async () => {
    const medplum = new MockClient();
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <RelatedClaims claim={{ resourceType: 'Claim', id: 'x', patient: {} } as WithId<Claim>} />
        </MedplumProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText('Related Claims')).not.toBeInTheDocument();
  });

  test('finds the claim a related claim links to, even when that claim has no visit link', async () => {
    const medplum = new MockClient();
    const base: Omit<Claim, 'created'> = {
      resourceType: 'Claim',
      status: 'draft',
      use: 'claim',
      type: { coding: [{ code: 'professional' }] },
      priority: { coding: [{ code: 'normal' }] },
      patient: createReference(HomerSimpson),
      provider: { reference: 'Practitioner/123' },
      insurance: [],
    };
    const visitClaim = await medplum.createResource<Claim>({ ...base, created: '2026-10-02' });
    const related = await medplum.createResource<Claim>({
      ...base,
      created: '2026-10-05',
      related: [{ claim: createReference(visitClaim) }],
    });

    renderFor(medplum, related);
    expect(await screen.findByRole('link', { name: /^Claim ·/ })).toHaveAttribute(
      'href',
      `/Billing/Claims/open/${visitClaim.id}`
    );
  });

  test('finds the visit claim and other related claims from a related claim', async () => {
    const { visitClaim, related, medplum } = await setup();
    const newer = await medplum.createResource<Claim>({ ...related, id: undefined, created: '2026-10-09' });

    renderFor(medplum, newer);
    const [visitLink] = await screen.findAllByRole('link', { name: /^Claim ·/ });
    expect(visitLink).toHaveAttribute('href', `/Billing/Claims/open/${visitClaim.id}`);
    expect(screen.getByRole('link', { name: /Claim · 10\/5\/2026/ })).toHaveAttribute(
      'href',
      `/Billing/Claims/open/${related.id}`
    );
  });
});
