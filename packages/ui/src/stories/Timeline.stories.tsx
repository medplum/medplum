import { Meta } from '@storybook/react';
import React from 'react';
import { Timeline, TimelineItem } from '../Timeline';

export default {
  title: 'Medplum/Timeline',
  component: Timeline,
} as Meta;

export const Basic = () => (
  <Timeline>
    <TimelineItem
      profile="Patient/597f5a0c-ac0f-47a2-a4db-bd0e0496f061"
      resource={{ resourceType: 'Communication', meta: { lastUpdated: new Date('2021-01-01T12:00:00Z') } }}>
      <div style={{ padding: '2px 16px' }}>
        <p>Hello world</p>
      </div>
    </TimelineItem>
    <TimelineItem
      profile="Patient/597f5a0c-ac0f-47a2-a4db-bd0e0496f061"
      resource={{ resourceType: 'Media', meta: { lastUpdated: new Date('2021-01-01T12:00:00Z') } }}>
      <img src="https://storybook.medplum.com/assets/papercut.jpg" alt="Papercut" title="Papercut" />
    </TimelineItem>
    <TimelineItem
      profile="Patient/597f5a0c-ac0f-47a2-a4db-bd0e0496f061"
      resource={{ resourceType: 'Media', meta: { lastUpdated: new Date('2021-01-01T12:00:00Z') } }}>
      <video src="https://storybook.medplum.com/assets/injury.mp4" controls></video>
    </TimelineItem>
  </Timeline>
);
