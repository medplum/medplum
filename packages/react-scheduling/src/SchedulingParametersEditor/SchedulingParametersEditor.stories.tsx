// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Modal, ScrollArea, Tabs, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import {
  clearHealthcareServiceSchedulingParameter,
  getSchedulingTimezone,
  SchedulingParametersURI,
  setHealthcareServiceSchedulingParameter,
} from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { ScheduleAvailabilityEditor } from '../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor';
import { buildSchedulableService, FullyConfiguredService, UnconfiguredService } from '../stories/scheduling';
import { SchedulingParametersEditor } from './SchedulingParametersEditor';

export default {
  title: 'Medplum/SchedulingParametersEditor',
  component: SchedulingParametersEditor,
} as Meta;

/**
 * Holds the edited service the way a host would, so saving in a story shows the values coming back rather
 * than resetting. The editor is seeded once, so it is remounted by key on each save.
 * @param props - The story heading and the service to start from.
 * @param props.title - The story heading.
 * @param props.initial - The service to start from.
 * @returns The hosted editor.
 */
function EditorHost(props: { readonly title: string; readonly initial: WithId<HealthcareService> }): JSX.Element {
  const [service, setService] = useState(props.initial);
  const [version, setVersion] = useState(0);
  return (
    <Document>
      <Title order={4} mb="md">
        {props.title}
      </Title>
      <SchedulingParametersEditor
        key={version}
        service={service}
        onSave={(updated) => {
          setService(updated);
          setVersion((previous) => previous + 1);
        }}
      />
    </Document>
  );
}

export const Configured = (): JSX.Element => (
  <EditorHost title="A visit type that sets every parameter" initial={FullyConfiguredService} />
);

export const DefaultsOnly = (): JSX.Element => (
  <EditorHost title="A visit type that sets nothing, so every field shows its fallback" initial={UnconfiguredService} />
);

export const Inactive = (): JSX.Element => (
  <EditorHost title="A deactivated visit type" initial={{ ...FullyConfiguredService, active: false }} />
);

export const OverbookingWithBuffers = (): JSX.Element => (
  <EditorHost
    title="Concurrent appointments alongside buffers, which largely defeats them"
    initial={clearHealthcareServiceSchedulingParameter(
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
    )}
  />
);

export const AwkwardAlignment = (): JSX.Element => (
  <EditorHost
    title="An interval that does not divide evenly into a day"
    initial={clearHealthcareServiceSchedulingParameter(
      buildSchedulableService({
        id: 'awkward',
        name: 'Extended Consult',
        category: 'Office visit',
        durationMinutes: 50,
        alignmentMinutes: 50,
      }),
      'timezone'
    )}
  />
);

export const DaylightSavingShift = (): JSX.Element => (
  <EditorHost
    title="A 90 minute grid, which divides into a day but not into an hour, so every start moves when the clocks change"
    initial={clearHealthcareServiceSchedulingParameter(
      buildSchedulableService({
        id: 'ninety-minute',
        name: 'New Patient Intake',
        category: 'Office visit',
        durationMinutes: 90,
        alignmentMinutes: 90,
      }),
      'timezone'
    )}
  />
);

export const NoDuration = (): JSX.Element => (
  <EditorHost
    title="A visit type with no Duration set"
    initial={{
      ...UnconfiguredService,
      name: 'Unmeasured Visit',
      extension: [
        {
          url: SchedulingParametersURI,
          extension: [{ url: 'bufferAfter', valueDuration: { value: 10, unit: 'min' } }],
        },
      ],
    }}
  />
);

export const StoredTimezone = (): JSX.Element => (
  <EditorHost
    title="A visit type carrying a time zone. Both time zone fields appear as pickers, and clearing one removes it on save"
    initial={buildSchedulableService({
      id: 'stored-timezone',
      name: 'Telehealth Follow-up',
      category: 'Telehealth',
      durationMinutes: 20,
      alignmentMinutes: 20,
    })}
  />
);

export const StoredAlignmentTimezone = (): JSX.Element => {
  const service = buildSchedulableService({
    id: 'stored-alignment-timezone',
    name: 'Morning Clinic',
    category: 'Office visit',
    durationMinutes: 30,
    alignmentMinutes: 30,
  });
  return (
    <EditorHost
      title="An alignment time zone alone brings both fields out, since a stored value should never act unseen"
      initial={setHealthcareServiceSchedulingParameter(clearHealthcareServiceSchedulingParameter(service, 'timezone'), {
        url: 'alignmentTimezone',
        valueCode: 'America/Denver',
      })}
    />
  );
};

export const UnrecognizedTimezone = (): JSX.Element => {
  const service = buildSchedulableService({
    id: 'unrecognized-timezone',
    name: 'Off-world Consult',
    category: 'Telehealth',
    durationMinutes: 30,
    alignmentMinutes: 30,
  });
  return (
    <EditorHost
      title="A zone this browser does not know is still shown and still offered, so saving cannot rewrite it"
      initial={setHealthcareServiceSchedulingParameter(service, { url: 'timezone', valueCode: 'Mars/Olympus_Mons' })}
    />
  );
};

export const WithCancel = (): JSX.Element => {
  const [service, setService] = useState(FullyConfiguredService);
  return (
    <Document>
      <SchedulingParametersEditor service={service} onSave={setService} onCancel={() => undefined} />
    </Document>
  );
};

export const InAModal = (): JSX.Element => {
  const [service, setService] = useState(FullyConfiguredService);
  const [opened, handlers] = useDisclosure(false);
  return (
    <Document>
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
    </Document>
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
    <Document>
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
    </Document>
  );
};
