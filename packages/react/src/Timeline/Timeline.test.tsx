import { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '../test-utils/render';
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
});
