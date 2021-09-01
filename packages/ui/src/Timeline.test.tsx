import { Communication, MedplumClient } from '@medplum/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { Timeline, TimelineItem } from './Timeline';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: (() => undefined) as any
});

describe('Timeline', () => {

  test('Renders', async () => {
    const resource: Communication = {
      resourceType: 'Communication'
    };

    render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <Timeline>
          <TimelineItem resource={resource}>test</TimelineItem>
        </Timeline>
      </MedplumProvider>
    );

    expect(screen.getByText('test')).not.toBeUndefined();
    expect(screen.queryByText('Like')).toBeNull();
    expect(screen.queryByText('Comment')).toBeNull();
  });

  test('Renders with social interactions', async () => {
    const resource: Communication = {
      resourceType: 'Communication'
    };

    render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <Timeline>
          <TimelineItem resource={resource} socialEnabled={true}>test</TimelineItem>
        </Timeline>
      </MedplumProvider>
    );

    expect(screen.getByText('test')).not.toBeUndefined();
    expect(screen.queryByText('Like')).not.toBeNull();
    expect(screen.queryByText('Comment')).not.toBeNull();
  });

});
