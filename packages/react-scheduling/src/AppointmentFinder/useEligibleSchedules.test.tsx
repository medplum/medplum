// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ReadablePromise } from '@medplum/core';
import type { HealthcareService, Location } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { SatelliteClinic, SchedulingFixtures, UltrasoundImagingService, WalkInService } from '../stories/scheduling';
import { act, render, screen, waitFor } from '../test-utils/render';
import { useEligibleSchedules } from './useEligibleSchedules';

const medplum = new MockClient();

interface HarnessProps {
  readonly service?: WithId<HealthcareService>;
  readonly clinic?: WithId<Location>;
}

const medplumWrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
);

function Harness(props: HarnessProps): JSX.Element {
  const { candidates, groups, excludedByClinic, loading, error } = useEligibleSchedules(props.service, props.clinic);
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'idle'}</div>
      <div data-testid="error">{error?.message ?? ''}</div>
      <div data-testid="excluded">{excludedByClinic}</div>
      <div data-testid="roles">{groups.map((group) => group.role).join(',')}</div>
      <div data-testid="actors">{candidates.map((candidate) => candidate.actorDisplay).join(',')}</div>
    </div>
  );
}

function setup(props: HarnessProps): void {
  render(<Harness {...props} />, medplumWrapper);
}

async function settle(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
}

describe('useEligibleSchedules', () => {
  beforeAll(async () => {
    for (const resource of SchedulingFixtures) {
      await medplum.createResource(resource);
    }
  });

  test('Groups the schedules a service is held on by the role each one fills', async () => {
    setup({ service: UltrasoundImagingService });
    await settle();

    // The questions a booking form asks are discovered from the data: this
    // service is held on people, rooms and devices, so it asks about all three.
    expect(screen.getByTestId('roles')).toHaveTextContent('provider,room,device');
    expect(screen.getByTestId('error')).toHaveTextContent('');
    expect(screen.getByTestId('excluded')).toHaveTextContent('0');
  });

  test('Leaves out actors sited at another clinic, and says how many', async () => {
    setup({ service: UltrasoundImagingService, clinic: SatelliteClinic });
    await settle();

    const kept = screen.getByTestId('actors').textContent ?? '';
    expect(kept).not.toContain('Exam Room A');
    expect(Number(screen.getByTestId('excluded').textContent)).toBeGreaterThan(0);
  });

  test('Loads nothing without a service', async () => {
    const search = vi.spyOn(medplum, 'search');
    setup({});
    await settle();

    expect(search).not.toHaveBeenCalled();
    expect(screen.getByTestId('actors')).toHaveTextContent('');
    search.mockRestore();
  });

  test('Reports an empty result for a service nothing is held on', async () => {
    setup({ service: WalkInService });
    await settle();

    expect(screen.getByTestId('actors')).toHaveTextContent('');
    expect(screen.getByTestId('roles')).toHaveTextContent('');
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });

  test('Surfaces a failed search rather than an empty list', async () => {
    const search = vi.spyOn(medplum, 'search').mockRejectedValue(new Error('Schedule search is down'));

    setup({ service: UltrasoundImagingService });
    await settle();

    // An empty list would read as "nobody offers this", which is a different
    // thing to tell the user than "we could not find out".
    expect(screen.getByTestId('error')).toHaveTextContent('Schedule search is down');
    expect(screen.getByTestId('actors')).toHaveTextContent('');
    expect(screen.getByTestId('excluded')).toHaveTextContent('0');
    search.mockRestore();
  });

  test('Ignores a failure from a load the chosen service has already moved on from', async () => {
    let failFirstSearch = (): void => {};
    const pending = new ReadablePromise(
      new Promise<never>((_resolve, reject) => {
        failFirstSearch = () => reject(new Error('Schedule search is down'));
      })
    );
    // Swallow the rejection the spy hands back, which nothing awaits once the
    // hook has aborted it.
    pending.catch(() => undefined);
    const search = vi.spyOn(medplum, 'search').mockReturnValueOnce(pending);

    const { rerender } = render(<Harness service={UltrasoundImagingService} />, medplumWrapper);

    // The first service's search fails only after the choice moved on. Its error
    // belongs to a question nobody is asking any more, so it must not land.
    rerender(<Harness service={WalkInService} />);
    await act(async () => {
      failFirstSearch();
    });
    await settle();

    expect(screen.getByTestId('error')).toHaveTextContent('');
    search.mockRestore();
  });
});
