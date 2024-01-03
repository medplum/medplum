import { DrAliceSmithSchedule, ExampleQuestionnaire } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { Scheduler } from './Scheduler';
import { withMockedDate } from '../stories/MockDateWrapper';
import { useEffect, useState } from 'react';
import { createReference } from '@medplum/core';
import { Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';

export default {
  title: 'Medplum/Scheduler',
  component: Scheduler,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element => {
  const medplum = useMedplum();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const schedule = createReference(DrAliceSmithSchedule);
    const slots: Slot[] = [];
    const slotDate = new Date();
    for (let day = 0; day < 32; day++) {
      for (const hour of [9]) {
        slotDate.setHours(hour, 0, 0, 0);
        slots.push({
          resourceType: 'Slot',
          id: `slot-${day}-${hour}`,
          start: slotDate.toISOString(),
          schedule,
        });
      }
      slotDate.setDate(slotDate.getDate() + 1);
    }

    const promises = slots.map((slot) => {
      return medplum.createResource(slot);
    });

    Promise.all(promises)
      .then(() => setReady(true))
      .catch(console.log);
  }, [medplum]);

  if (!ready) {
    return <div>Loading...</div>;
  }

  return (
    <Document>
      <Scheduler schedule={DrAliceSmithSchedule} questionnaire={ExampleQuestionnaire} />
    </Document>
  );
};
