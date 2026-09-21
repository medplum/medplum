// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Modal, ScrollArea, Tabs } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import {
  clearHealthcareServiceSchedulingParameter,
  getSchedulingTimezone,
  SchedulingParametersURI,
  setHealthcareServiceSchedulingParameter,
} from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { action } from 'storybook/actions';
import { ScheduleAvailabilityEditor } from '../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor';
import { withDocument } from '../stories/decorators';
import { buildSchedulableService, FullyConfiguredService, UnconfiguredService } from '../stories/scheduling';
import { SchedulingParametersEditor } from './SchedulingParametersEditor';

/** Each story renders the editor alone so the Code panel shows real usage; `withDocument` adds the page. */
export default {
  title: 'Medplum/SchedulingParametersEditor/HealthcareService',
  component: SchedulingParametersEditor,
  decorators: [withDocument],
} as Meta;

const InactiveService: WithId<HealthcareService> = { ...FullyConfiguredService, active: false };

const InjectionClinic = clearHealthcareServiceSchedulingParameter(
  buildSchedulableService({
    id: 'overbooked',
    name: 'Injection Clinic',
    category: 'Treatment',
    durationMinutes: 20,
    alignmentMinutes: 20,
    bufferBeforeMinutes: 5,
    bufferAfterMinutes: 5,
    slotCapacity: 3,
  }),
  'timezone'
);

const ExtendedConsult = clearHealthcareServiceSchedulingParameter(
  buildSchedulableService({
    id: 'awkward',
    name: 'Extended Consult',
    category: 'Office visit',
    durationMinutes: 50,
    alignmentMinutes: 50,
  }),
  'timezone'
);

const NewPatientIntake = clearHealthcareServiceSchedulingParameter(
  buildSchedulableService({
    id: 'ninety-minute',
    name: 'New Patient Intake',
    category: 'Office visit',
    durationMinutes: 90,
    alignmentMinutes: 90,
  }),
  'timezone'
);

const UnmeasuredVisit: WithId<HealthcareService> = {
  ...UnconfiguredService,
  name: 'Unmeasured Visit',
  extension: [
    {
      url: SchedulingParametersURI,
      extension: [{ url: 'bufferAfter', valueDuration: { value: 10, unit: 'min' } }],
    },
  ],
};

const TelehealthFollowUp = buildSchedulableService({
  id: 'stored-timezone',
  name: 'Telehealth Follow-up',
  category: 'Telehealth',
  durationMinutes: 20,
  alignmentMinutes: 20,
});

const MorningClinic = setHealthcareServiceSchedulingParameter(
  clearHealthcareServiceSchedulingParameter(
    buildSchedulableService({
      id: 'stored-alignment-timezone',
      name: 'Morning Clinic',
      category: 'Office visit',
      durationMinutes: 30,
      alignmentMinutes: 30,
    }),
    'timezone'
  ),
  { url: 'alignmentTimezone', valueCode: 'America/Denver' }
);

const OffWorldConsult = setHealthcareServiceSchedulingParameter(
  buildSchedulableService({
    id: 'unrecognized-timezone',
    name: 'Off-world Consult',
    category: 'Telehealth',
    durationMinutes: 30,
    alignmentMinutes: 30,
  }),
  { url: 'timezone', valueCode: 'Mars/Olympus_Mons' }
);

const DraftVisitType: HealthcareService = { resourceType: 'HealthcareService', name: 'New Visit Type' };

export const Configured = (): JSX.Element => (
  <SchedulingParametersEditor service={FullyConfiguredService} onSave={action('onSave')} />
);
Configured.parameters = { heading: 'A visit type that sets every parameter' };

export const DefaultsOnly = (): JSX.Element => (
  <SchedulingParametersEditor service={UnconfiguredService} onSave={action('onSave')} />
);
DefaultsOnly.parameters = {
  heading:
    "A visit type that sets nothing: every field shows scheduling's default, and neither time zone field is offered",
};

export const Inactive = (): JSX.Element => (
  <SchedulingParametersEditor service={InactiveService} onSave={action('onSave')} />
);
Inactive.parameters = {
  heading:
    'A deactivated visit type. The Active switch is on this level only, and turning it back on relabels the save',
};

export const OverbookingWithBuffers = (): JSX.Element => (
  <SchedulingParametersEditor service={InjectionClinic} onSave={action('onSave')} />
);
OverbookingWithBuffers.parameters = {
  heading: 'Concurrent appointments alongside buffers, which largely defeats them',
};

export const AwkwardAlignment = (): JSX.Element => (
  <SchedulingParametersEditor service={ExtendedConsult} onSave={action('onSave')} />
);
AwkwardAlignment.parameters = { heading: 'An interval that does not divide evenly into a day' };

export const DaylightSavingShift = (): JSX.Element => (
  <SchedulingParametersEditor service={NewPatientIntake} onSave={action('onSave')} />
);
DaylightSavingShift.parameters = {
  heading:
    'A 90 minute grid, which divides into a day but not into an hour, so every start moves when the clocks change',
};

export const NoDuration = (): JSX.Element => (
  <SchedulingParametersEditor service={UnmeasuredVisit} onSave={action('onSave')} />
);
NoDuration.parameters = { heading: 'A visit type with no Duration set' };

export const StoredTimezone = (): JSX.Element => (
  <SchedulingParametersEditor service={TelehealthFollowUp} onSave={action('onSave')} />
);
StoredTimezone.parameters = {
  heading:
    'A visit type carrying a time zone. Both time zone fields appear as pickers, and clearing one removes it on save',
};

export const StoredAlignmentTimezone = (): JSX.Element => (
  <SchedulingParametersEditor service={MorningClinic} onSave={action('onSave')} />
);
StoredAlignmentTimezone.parameters = {
  heading: 'An alignment time zone alone brings both fields out, since a stored value should never act unseen',
};

export const UnrecognizedTimezone = (): JSX.Element => (
  <SchedulingParametersEditor service={OffWorldConsult} onSave={action('onSave')} />
);
UnrecognizedTimezone.parameters = {
  heading: 'A zone this browser does not know is still shown and still offered, so saving cannot rewrite it',
};

export const DraftService = (): JSX.Element => (
  <SchedulingParametersEditor service={DraftVisitType} onSave={action('onSave')} />
);
DraftService.parameters = {
  heading: 'A visit type not yet created, which a create flow would save with createResource',
};

export const WithCancel = (): JSX.Element => (
  <SchedulingParametersEditor
    service={FullyConfiguredService}
    onSave={action('onSave')}
    onCancel={action('onCancel')}
  />
);

export const InAModal = (): JSX.Element => {
  const [service, setService] = useState(FullyConfiguredService);
  const [opened, handlers] = useDisclosure(false);
  return (
    <>
      <Button onClick={handlers.open}>Edit scheduling settings</Button>
      <Modal
        opened={opened}
        onClose={handlers.close}
        title={`Scheduling settings for ${service.name}`}
        size="xl"
        centered
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <SchedulingParametersEditor
          key={service.meta?.versionId ?? 'draft'}
          service={service}
          onCancel={handlers.close}
          onSave={(updated) => {
            setService(updated);
            handlers.close();
          }}
        />
      </Modal>
    </>
  );
};

/**
 * Both halves of a visit type's configuration in one place: the parameters here, and the working hours from
 * ScheduleAvailabilityEditor. The host composes them rather than either component absorbing the other, so
 * each keeps its own Save and its own rules about what blocks one.
 * @returns The paired editors in a modal.
 */
export const WithAvailability = (): JSX.Element => {
  const [service, setService] = useState<WithId<HealthcareService>>({
    ...FullyConfiguredService,
    availableTime: [
      { daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ],
  });
  const [opened, handlers] = useDisclosure(false);
  const [tab, setTab] = useState<string | null>('settings');

  return (
    <>
      <Button onClick={handlers.open}>Configure {service.name}</Button>
      <Modal
        opened={opened}
        onClose={handlers.close}
        title={`Configure ${service.name}`}
        size="xl"
        centered
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Tabs value={tab} onChange={setTab}>
          <Tabs.List mb="lg">
            <Tabs.Tab value="settings">Scheduling settings</Tabs.Tab>
            <Tabs.Tab value="hours">Working hours</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="settings">
            <SchedulingParametersEditor
              key={`settings-${tab}`}
              service={service}
              onCancel={handlers.close}
              onSave={setService}
            />
          </Tabs.Panel>
          <Tabs.Panel value="hours">
            <ScheduleAvailabilityEditor
              key={`hours-${tab}`}
              service={service}
              timezone={getSchedulingTimezone(service)}
              onCancel={handlers.close}
              onSave={setService}
            />
          </Tabs.Panel>
        </Tabs>
      </Modal>
    </>
  );
};
