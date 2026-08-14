// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ReadablePromise, getReferenceString } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import {
  DrRiveraSchedule,
  SatelliteClinic,
  SchedulingFixtures,
  UltrasoundImagingService,
  WalkInService,
} from '../stories/scheduling';
import { act, render, screen, waitFor } from '../test-utils/render';
import { getCandidateDisplay } from './AppointmentFinder.schedules';
import { useEligibleSchedules } from './useEligibleSchedules';

const medplum = new MockClient();

interface HarnessProps {
  readonly service?: Reference<HealthcareService> | WithId<HealthcareService>;
  readonly location?: WithId<Location>;
}

const medplumWrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
);

function Harness(props: HarnessProps): JSX.Element {
  const { candidates, groups, excludedByLocation, loading, error } = useEligibleSchedules(
    props.service,
    props.location
  );
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'idle'}</div>
      <div data-testid="error">{error?.message ?? ''}</div>
      <div data-testid="excluded">{excludedByLocation}</div>
      <div data-testid="roles">{groups.map((group) => group.role).join(',')}</div>
      <div data-testid="actors">{candidates.map(getCandidateDisplay).join(',')}</div>
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
    setup({ service: UltrasoundImagingService, location: SatelliteClinic });
    await settle();

    const kept = screen.getByTestId('actors').textContent ?? '';
    expect(kept).not.toContain('Exam Room A');
    expect(Number(screen.getByTestId('excluded').textContent)).toBeGreaterThan(0);
  });

  test('Reads a service given only as a reference', async () => {
    setup({ service: { reference: getReferenceString(UltrasoundImagingService) } });
    await settle();

    expect(screen.getByTestId('roles')).toHaveTextContent('provider,room,device');
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });

  test('Reports a service reference that cannot be read', async () => {
    setup({ service: { reference: 'HealthcareService/missing' } });

    // Staying on the spinner would leave the form waiting on a service that is
    // never going to arrive.
    await waitFor(() => expect(screen.getByTestId('error')).not.toHaveTextContent(''));
    expect(screen.getByTestId('loading')).toHaveTextContent('idle');
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

  test('Withholds the actors of the service last asked about while the next one loads', async () => {
    const { rerender } = render(<Harness service={UltrasoundImagingService} />, medplumWrapper);
    await settle();
    expect(screen.getByTestId('actors')).toHaveTextContent('Dr. Maya Rivera');

    const search = vi.spyOn(medplum, 'search').mockReturnValue(
      new ReadablePromise(
        new Promise<never>(() => {
          // Never settles, so the render under test is mid-load.
        })
      )
    );
    rerender(<Harness service={WalkInService} />);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('loading'));

    // These drive the form's fields, so leaving them up would offer actors that
    // can be chosen for a service they are not bookable for.
    expect(screen.getByTestId('actors')).toHaveTextContent('');
    expect(screen.getByTestId('roles')).toHaveTextContent('');
    search.mockRestore();
  });

  test('Ignores a result from a load the chosen service has already moved on from', async () => {
    let answerFirstSearch = (): void => {};
    const pending = new ReadablePromise(
      new Promise<never>((resolve) => {
        answerFirstSearch = () =>
          resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [{ resource: DrRiveraSchedule, search: { mode: 'match' } }],
          } as never);
      })
    );
    const search = vi.spyOn(medplum, 'search').mockReturnValueOnce(pending);

    const { rerender } = render(<Harness service={UltrasoundImagingService} />, medplumWrapper);
    rerender(<Harness service={WalkInService} />);
    await settle();

    // The first service's search answers only after the choice moved on. Landing
    // it would stamp the state with the question it answers rather than the one
    // being asked, which reads as permanently stale: the spinner would stay up
    // with nothing in flight left to take it down.
    await act(async () => {
      answerFirstSearch();
    });

    expect(screen.getByTestId('loading')).toHaveTextContent('idle');
    expect(screen.getByTestId('actors')).toHaveTextContent('');
    expect(screen.getByTestId('roles')).toHaveTextContent('');
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
