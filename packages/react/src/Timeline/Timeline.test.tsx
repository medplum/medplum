// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, render, screen } from '../test-utils/render';
import { Timeline, TimelineItem } from './Timeline';

const medplum = new MockClient();

describe('Timeline', () => {
  test('Renders', async () => {
    const resource: Communication = {
      resourceType: 'Communication',
    } as Communication;

    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <Timeline>
            <TimelineItem resource={resource}>test</TimelineItem>
          </Timeline>
        </MedplumProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('test')).toBeDefined();
    expect(screen.queryByText('Like')).toBeNull();
    expect(screen.queryByText('Comment')).toBeNull();
  });

  test('Renders on behalf of when present', async () => {
    const resource: Communication = {
      resourceType: 'Communication',
      meta: {
        author: { reference: 'Practitioner/124' },
        onBehalfOf: { reference: 'Practitioner/124' },
      },
    } as Communication;

    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <Timeline>
              <TimelineItem resource={resource}>test</TimelineItem>
            </Timeline>
          </MedplumProvider>
        </MemoryRouter>
      );
    });

    expect(await screen.findAllByText('Alice Smith')).toHaveLength(2);
    expect(screen.getByText(/on behalf of/)).toBeDefined();
  });

  test('Does not render on behalf of when absent', async () => {
    const resource: Communication = {
      resourceType: 'Communication',
      meta: {
        author: { reference: 'Practitioner/124' },
      },
    } as Communication;

    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <Timeline>
              <TimelineItem resource={resource}>test</TimelineItem>
            </Timeline>
          </MedplumProvider>
        </MemoryRouter>
      );
    });

    expect(screen.queryByText(/on behalf of/)).toBeNull();
  });
});
