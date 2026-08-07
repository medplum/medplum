// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { SchedulingFixtures, SurgicalFixtures } from '../stories/scheduling';
import { render, screen } from '../test-utils/render';
import { ActorName } from './ActorName';

const medplum = new MockClient();

function setup(children: JSX.Element): void {
  const wrapper = ({ children: inner }: { children: ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{inner}</MedplumProvider>
  );
  render(children, wrapper);
}

describe('ActorName', () => {
  beforeAll(async () => {
    for (const resource of [...SchedulingFixtures, ...SurgicalFixtures]) {
      await medplum.createResource(resource);
    }
  });

  test('Names the actor as the reference names it', () => {
    setup(<ActorName actor={{ reference: 'PractitionerRole/role-dr-chen', display: 'Dr. Wei Chen' }} />);
    expect(screen.getByText('Dr. Wei Chen')).toBeInTheDocument();
  });

  test('Prefers the display over the role, which would name every surgeon alike', async () => {
    setup(<ActorName actor={{ reference: 'PractitionerRole/role-dr-chen' }} />);

    // Nothing to go on but the resource, and a PractitionerRole formats as the
    // role rather than the person.
    expect(await screen.findByText('Doctor')).toBeInTheDocument();
  });

  test('Falls back to the resource for a reference with no display', async () => {
    setup(<ActorName actor={{ reference: 'Device/ultrasound-1' }} />);
    expect(await screen.findByText('Ultrasound 1 (Main Campus)')).toBeInTheDocument();
  });
});
