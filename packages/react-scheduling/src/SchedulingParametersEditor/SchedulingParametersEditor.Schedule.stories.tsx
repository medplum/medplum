// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Divider, Modal, ScrollArea, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { clearHealthcareServiceSchedulingParameter, getReferenceString, ServiceTypeReferenceURI } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { action } from 'storybook/actions';
import type { SchedulingParameterValues } from '../parameterValues';
import { setScheduleSchedulingParameterValues } from '../parameterValues';
import { withDocument } from '../stories/decorators';
import { buildSchedulableService, FullyConfiguredService, UnconfiguredService } from '../stories/scheduling';
import { SchedulingParametersEditor } from './SchedulingParametersEditor';

/** Each story renders the editor alone so the Code panel shows real usage; `withDocument` adds the page. */
export default {
  title: 'Medplum/SchedulingParametersEditor/Schedule',
  component: SchedulingParametersEditor,
  decorators: [withDocument],
} as Meta;

/** A visit type setting some parameters and not others, so a calendar inherits from both places. */
const FollowUpService = clearHealthcareServiceSchedulingParameter(
  buildSchedulableService({
    id: 'follow-up',
    name: 'Follow-up Visit',
    category: 'Office visit',
    durationMinutes: 20,
    alignmentMinutes: 20,
    bufferBeforeMinutes: 5,
  }),
  'timezone'
);

/**
 * A calendar offering the visit type, which is what makes an override on it take effect.
 * @param service - The visit type the calendar offers.
 * @param overrides - The parameters the calendar overrides for it.
 * @returns The calendar.
 */
function calendarFor(service: WithId<HealthcareService>, overrides: SchedulingParameterValues = {}): Schedule {
  const calendar: Schedule = {
    resourceType: 'Schedule',
    id: 'dr-rivera-calendar',
    actor: [{ reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' }],
    serviceType: [
      {
        text: service.name,
        extension: [{ url: ServiceTypeReferenceURI, valueReference: { reference: getReferenceString(service) } }],
      },
    ],
  };
  return setScheduleSchedulingParameterValues(calendar, service, overrides);
}

const EmptyOverride = calendarFor(FollowUpService);
const BufferAndTimezoneOverride = calendarFor(FollowUpService, { bufferAfter: 15, timezone: 'America/Chicago' });
const IntervalOverride = calendarFor(FollowUpService, { alignmentInterval: 15 });
const CapacityOverride = calendarFor(FullyConfiguredService, { slotCapacity: 3 });
const UnconfiguredCalendar = calendarFor(UnconfiguredService);

export const InheritsEverything = (): JSX.Element => (
  <SchedulingParametersEditor schedule={EmptyOverride} service={FollowUpService} onSave={action('onSave')} />
);
InheritsEverything.parameters = {
  heading:
    "A calendar overriding nothing. Each empty field names what it inherits: the visit type's value, or scheduling's default where the visit type sets none",
};

export const OverridesSome = (): JSX.Element => (
  <SchedulingParametersEditor
    schedule={BufferAndTimezoneOverride}
    service={FollowUpService}
    onSave={action('onSave')}
  />
);
OverridesSome.parameters = {
  heading: 'A calendar overriding one buffer and setting its own time zone, which a calendar is always offered',
};

export const OverridingTheGrid = (): JSX.Element => (
  <SchedulingParametersEditor schedule={IntervalOverride} service={FollowUpService} onSave={action('onSave')} />
);
OverridingTheGrid.parameters = {
  heading:
    'A calendar already overriding its interval, so that field is shown and can be cleared. Offset, which it does not override, stays hidden, and the interval disagreeing with the visit type is warned about',
};

export const CapacityAgainstInheritedBuffers = (): JSX.Element => (
  <SchedulingParametersEditor schedule={CapacityOverride} service={FullyConfiguredService} onSave={action('onSave')} />
);
CapacityAgainstInheritedBuffers.parameters = {
  heading: 'A calendar allowing concurrent appointments, warned about the buffers it inherits from the visit type',
};

export const NoDurationAnywhere = (): JSX.Element => (
  <SchedulingParametersEditor schedule={UnconfiguredCalendar} service={UnconfiguredService} onSave={action('onSave')} />
);
NoDurationAnywhere.parameters = {
  heading:
    'Neither the calendar nor the visit type sets a duration. The warning names no field to jump to, since duration is not offered here',
};

/**
 * Both levels over one visit type. Saving the visit type remounts the calendar editor, so its placeholders
 * pick up the new values it inherits.
 * @returns The two editors.
 */
export const AlongsideTheVisitType = (): JSX.Element => {
  const [service, setService] = useState<WithId<HealthcareService>>(FollowUpService);
  const [schedule, setSchedule] = useState(() => calendarFor(FollowUpService, { bufferAfter: 15 }));
  const [version, setVersion] = useState(0);
  return (
    <>
      <Title order={4} mb="md">
        Visit type
      </Title>
      <SchedulingParametersEditor
        key={`service-${version}`}
        service={service}
        onSave={(updated) => {
          setService(updated);
          setVersion((previous) => previous + 1);
        }}
      />
      <Divider my="xl" />
      <Title order={4} mb="md">
        Dr. Maya Rivera's calendar
      </Title>
      <SchedulingParametersEditor
        key={`schedule-${version}`}
        schedule={schedule}
        service={service}
        onSave={(updated) => {
          setSchedule(updated);
          setVersion((previous) => previous + 1);
        }}
      />
    </>
  );
};

export const InAModal = (): JSX.Element => {
  const [schedule, setSchedule] = useState(() => calendarFor(FollowUpService, { bufferAfter: 15 }));
  const [version, setVersion] = useState(0);
  const [opened, handlers] = useDisclosure(false);
  return (
    <>
      <Button onClick={handlers.open}>Edit {FollowUpService.name} on this calendar</Button>
      <Modal
        opened={opened}
        onClose={handlers.close}
        title={`${FollowUpService.name} on Dr. Maya Rivera's calendar`}
        size="xl"
        centered
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <SchedulingParametersEditor
          key={version}
          schedule={schedule}
          service={FollowUpService}
          onCancel={handlers.close}
          onSave={(updated) => {
            setSchedule(updated);
            setVersion((previous) => previous + 1);
            handlers.close();
          }}
        />
      </Modal>
    </>
  );
};
