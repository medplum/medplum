import { Reference } from '@medplum/core';
import { Meta } from '@storybook/react';
import React from 'react';
import { Timeline, TimelineItem } from '../Timeline';

export default {
  title: 'Medplum/Timeline',
  component: Timeline,
} as Meta;

const author: Reference = {
  reference: 'Patient/' + process.env.SAMPLE_PATIENT_ID
}

export const Basic = () => (
  <Timeline>
    <TimelineItem
      profile={author}
      resource={{
        resourceType: 'Communication',
        id: '123',
        meta: { lastUpdated: '2021-01-01T12:00:00Z' }
      }}>
      <div style={{ padding: '2px 16px' }}>
        <p>Hello world</p>
      </div>
    </TimelineItem>
    <TimelineItem
      profile={author}
      resource={{
        resourceType: 'Media',
        id: '123',
        meta: { lastUpdated: '2021-01-01T12:00:00Z' }
      }}>
      <img src="https://storybook.medplum.com/assets/papercut.jpg" alt="Papercut" title="Papercut" />
    </TimelineItem>
    <TimelineItem
      profile={author}
      resource={{
        resourceType: 'Media',
        id: '123',
        meta: { lastUpdated: '2021-01-01T12:00:00Z' }
      }}>
      <video src="https://storybook.medplum.com/assets/injury.mp4" controls></video>
    </TimelineItem>
  </Timeline>
);
