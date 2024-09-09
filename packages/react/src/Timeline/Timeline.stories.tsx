import { createReference } from '@medplum/core';
import { DrAliceSmith } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Timeline, TimelineItem } from './Timeline';

export default {
  title: 'Medplum/Timeline',
  component: Timeline,
} as Meta;

const author = createReference(DrAliceSmith);

export const Basic = (): JSX.Element => (
  <Timeline>
    <TimelineItem
      profile={author}
      resource={{
        resourceType: 'Communication',
        id: '123',
        meta: { lastUpdated: '2021-01-01T12:00:00Z' },
        status: 'completed',
      }}
    >
      <div style={{ padding: '2px 16px' }}>
        <p>Hello world</p>
      </div>
    </TimelineItem>
    <TimelineItem
      profile={author}
      resource={{
        resourceType: 'Media',
        id: '123',
        meta: { lastUpdated: '2021-01-01T12:00:00Z' },
        status: 'completed',
        content: { url: 'https://www.medplum.com/img/wikimedia-papercut.jpg' },
      }}
    >
      <img src="https://www.medplum.com/img/wikimedia-papercut.jpg" alt="Papercut" title="Papercut" />
    </TimelineItem>
    <TimelineItem
      profile={author}
      resource={{
        resourceType: 'Media',
        id: '123',
        meta: { lastUpdated: '2021-01-01T12:00:00Z' },
        status: 'completed',
        content: { url: 'https://www.medplum.com/img/beat-boxing-mri.mp4' },
      }}
    >
      <video src="https://www.medplum.com/img/beat-boxing-mri.mp4" controls autoPlay muted></video>
    </TimelineItem>
  </Timeline>
);
