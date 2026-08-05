// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Container, Paper, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getSchedulingTimezone, SchedulingParametersURI } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { ScheduleAvailabilityEditor } from './ScheduleAvailabilityEditor';

export default {
  title: 'Medplum/ScheduleAvailabilityEditor',
  component: ScheduleAvailabilityEditor,
} as Meta;

/*
 * Stands in for `Document` from @medplum/react, which this package does not depend on. Mirrors what
 * that component renders, so the stories frame the editor the way a page in an app would.
 */
function StoryShell(props: { readonly children: ReactNode }): JSX.Element {
  return (
    <Container>
      <Paper p="md" shadow="sm" radius="sm" withBorder>
        {props.children}
      </Paper>
    </Container>
  );
}

const service: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'service-1',
  name: 'Follow-Up Visit',
  // Service-level default hours, inherited by schedules that have no override.
  availableTime: [
    { daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
  ],
};

const scheduleWithHours: Schedule = {
  resourceType: 'Schedule',
  id: 'schedule-1',
  actor: [{ reference: 'Practitioner/123', display: 'Dr. Alice Smith' }],
  extension: [
    {
      url: SchedulingParametersURI,
      extension: [
        { url: 'service', valueReference: { reference: 'HealthcareService/service-1' } },
        { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
        { url: 'timezone', valueCode: 'America/New_York' },
        {
          url: 'availability',
          extension: [
            {
              url: 'availableTime',
              extension: [
                { url: 'daysOfWeek', valueCode: 'mon' },
                { url: 'availableStartTime', valueTime: '09:00:00' },
                { url: 'availableEndTime', valueTime: '12:00:00' },
              ],
            },
            {
              url: 'availableTime',
              extension: [
                { url: 'daysOfWeek', valueCode: 'mon' },
                { url: 'availableStartTime', valueTime: '13:00:00' },
                { url: 'availableEndTime', valueTime: '17:00:00' },
              ],
            },
            {
              url: 'availableTime',
              extension: [
                { url: 'daysOfWeek', valueCode: 'wed' },
                { url: 'availableStartTime', valueTime: '09:00:00' },
                { url: 'availableEndTime', valueTime: '17:00:00' },
              ],
            },
            {
              url: 'availableTime',
              extension: [
                { url: 'daysOfWeek', valueCode: 'fri' },
                { url: 'allDay', valueBoolean: true },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const emptySchedule: Schedule = {
  resourceType: 'Schedule',
  id: 'schedule-2',
  actor: [{ reference: 'Practitioner/123', display: 'Dr. Alice Smith' }],
};

// An on-call schedule whose windows run past midnight. The editor cannot author
// these, so it splits them at midnight on mount: Thursday 10:00 PM to 12:00 AM
// plus Friday 12:00 AM to 6:00 AM, and so on.
const overnightSchedule: Schedule = {
  resourceType: 'Schedule',
  id: 'schedule-4',
  actor: [{ reference: 'Practitioner/123', display: 'Dr. Alice Smith' }],
  extension: [
    {
      url: SchedulingParametersURI,
      extension: [
        { url: 'service', valueReference: { reference: 'HealthcareService/service-1' } },
        { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
        { url: 'timezone', valueCode: 'America/New_York' },
        {
          url: 'availability',
          extension: [
            {
              url: 'availableTime',
              extension: [
                { url: 'daysOfWeek', valueCode: 'thu' },
                { url: 'availableStartTime', valueTime: '22:00:00' },
                { url: 'availableEndTime', valueTime: '06:00:00' },
              ],
            },
            {
              url: 'availableTime',
              extension: [
                { url: 'daysOfWeek', valueCode: 'fri' },
                { url: 'availableStartTime', valueTime: '22:00:00' },
                { url: 'availableEndTime', valueTime: '06:00:00' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// Hours written by the API at times the pickers do not offer. The editor shows
// them as stored and marks them, rather than rounding hours nobody asked it to
// change.
const offIntervalSchedule: Schedule = {
  resourceType: 'Schedule',
  id: 'schedule-5',
  actor: [{ reference: 'Practitioner/123', display: 'Dr. Alice Smith' }],
  extension: [
    {
      url: SchedulingParametersURI,
      extension: [
        { url: 'service', valueReference: { reference: 'HealthcareService/service-1' } },
        { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
        { url: 'timezone', valueCode: 'America/New_York' },
        {
          url: 'availability',
          extension: [
            {
              url: 'availableTime',
              extension: [
                { url: 'daysOfWeek', valueCode: 'tue' },
                { url: 'availableStartTime', valueTime: '09:07:00' },
                { url: 'availableEndTime', valueTime: '16:43:00' },
              ],
            },
            {
              url: 'availableTime',
              extension: [
                { url: 'daysOfWeek', valueCode: 'thu' },
                { url: 'availableStartTime', valueTime: '09:00:00' },
                { url: 'availableEndTime', valueTime: '17:00:00' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// The editor renders form content only, so the heading and the container are
// the caller's choice. These stories show it on a page; the provider app puts
// the same component in a Modal.
function EditorStory(props: {
  schedule: Schedule;
  onCancel?: () => void;
  forService?: WithId<HealthcareService>;
}): JSX.Element {
  const [schedule, setSchedule] = useState(props.schedule);
  const forService = props.forService ?? service;

  return (
    <StoryShell>
      <Title order={3} mb="xs">
        Weekly Availability for {forService.name}
      </Title>
      <ScheduleAvailabilityEditor
        schedule={schedule}
        service={forService}
        timezone={getSchedulingTimezone(schedule, forService)}
        onCancel={props.onCancel}
        onSave={setSchedule}
      />
    </StoryShell>
  );
}

// Schedule with a SchedulingParameters block but no availability override; the
// editor seeds from the service default with the override switch off.
const inheritingSchedule: Schedule = {
  resourceType: 'Schedule',
  id: 'schedule-3',
  actor: [{ reference: 'Practitioner/123', display: 'Dr. Alice Smith' }],
  extension: [
    {
      url: SchedulingParametersURI,
      extension: [
        { url: 'service', valueReference: { reference: 'HealthcareService/service-1' } },
        { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
      ],
    },
  ],
};

// Custom hours overriding the service default, including a split day and a full
// 24 hour day.
export const CustomHoursOverride = (): JSX.Element => <EditorStory schedule={scheduleWithHours} />;

// Inherits the service default; the day rows are read-only until custom
// availability is switched on.
export const InheritingServiceDefault = (): JSX.Element => <EditorStory schedule={inheritingSchedule} />;

// Stored hours that run past midnight, split across days on mount.
export const OvernightHours = (): JSX.Element => <EditorStory schedule={overnightSchedule} />;

// Stored hours that fall between the times the pickers list. They are shown as
// stored, listed as the current selection, and can be typed back in full.
export const OffIntervalHours = (): JSX.Element => <EditorStory schedule={offIntervalSchedule} />;

// Neither the Schedule nor the service says anything about hours, so there is
// nothing to inherit and the week opens empty. This is the one state where the
// read-only rows are genuinely blank rather than showing a default; a Schedule
// that merely lacks an override looks like InheritingServiceDefault above,
// because the service's hours are still the ones in effect.
export const NoHoursAnywhere = (): JSX.Element => (
  <EditorStory
    schedule={emptySchedule}
    forService={{ resourceType: 'HealthcareService', id: 'service-3', name: 'New Visit Type' }}
  />
);

// Passing onCancel adds a Cancel button beside Save, for hosts that can be
// dismissed. Without it, Save is the only action and spans the full width.
export const WithCancel = (): JSX.Element => <EditorStory schedule={scheduleWithHours} onCancel={() => undefined} />;

// Omitting the Schedule edits the service's own default hours, which every
// calendar without an override follows. There is no override to switch on and
// no default to reset to, so that chrome is absent.
function ServiceDefaultStory(props: { readonly initial: WithId<HealthcareService> }): JSX.Element {
  const [edited, setEdited] = useState(props.initial);
  return (
    <StoryShell>
      <Title order={3} mb="md">
        Default Availability for {edited.name}
      </Title>
      <ScheduleAvailabilityEditor
        service={edited}
        timezone={getSchedulingTimezone(undefined, edited)}
        onSave={setEdited}
      />
    </StoryShell>
  );
}

export const ServiceDefault = (): JSX.Element => <ServiceDefaultStory initial={service} />;

// A service with no hours at all is unrestricted rather than unavailable, so
// saving this week back would leave it bookable at any time rather than never.
// Save is disabled until a day is made available, with the reason on the button.
export const ServiceDefaultWithNoHours = (): JSX.Element => (
  <ServiceDefaultStory initial={{ resourceType: 'HealthcareService', id: 'service-2', name: 'Walk-In Visit' }} />
);
