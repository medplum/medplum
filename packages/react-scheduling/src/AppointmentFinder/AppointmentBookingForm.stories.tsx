// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, List, Stack, Text } from '@mantine/core';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { withChainedActorSearch, withFindStub, withFixtures, withMockedDate } from '../stories/decorators';
import {
  MainClinic,
  SchedulingFixtures,
  SubClinicProviderFixtures,
  SurgeryService,
  SurgicalFixtures,
  UltrasoundImagingService,
} from '../stories/scheduling';
import { AppointmentBookingForm } from './AppointmentBookingForm';

const STORY_FIXTURES = [...SchedulingFixtures, ...SurgicalFixtures, ...SubClinicProviderFixtures];

// A story's own decorators add to these rather than replacing them, so `$find` is
// stubbed per story: two stubs would both install, and which one answered would be
// an accident of effect ordering.
export default {
  title: 'Medplum/AppointmentBookingForm',
  component: AppointmentBookingForm,
  decorators: [withChainedActorSearch(), withFixtures(STORY_FIXTURES), withMockedDate],
} as Meta;

/**
 * The form from an empty state to a chosen time.
 *
 * Choose "Ultrasound Imaging" and the three role fields search against it: it is
 * held on practitioners, rooms and devices, and only the provider is required. So
 * "Find a time" stays unusable until a provider is named, and says so.
 *
 * Change a resource with a time already picked and the time goes — it was found for
 * resources that no longer stand — while the search stays open and re-runs, so the
 * replacement is one click away.
 * @returns The story.
 */
export const Basic = (): JSX.Element => (
  <Document>
    <AppointmentBookingForm />
  </Document>
);
Basic.decorators = [withFindStub()];

/**
 * A visit that needs a whole team free at once: a surgeon, an anesthesiologist
 * and an operating room.
 *
 * Everything named attends — `$find` intersects their schedules — so naming a
 * second surgeon narrows the times rather than widening them.
 * @returns The story.
 */
export const SurgicalTeam = (): JSX.Element => (
  <Document>
    <AppointmentBookingForm defaultService={SurgeryService} defaultLocation={MainClinic} />
  </Document>
);
SurgicalTeam.decorators = [withFindStub()];

/**
 * A fully configured visit type with nothing free.
 *
 * "No times for this selection" is a different dead end from a role field that finds
 * nobody, and the form says which.
 * @returns The story.
 */
export const NoAvailability = (): JSX.Element => (
  <Document>
    <AppointmentBookingForm />
  </Document>
);
NoAvailability.decorators = [withFindStub({ empty: true })];

/**
 * The site filter, which is asymmetric by role and reads as a bug until it is seen
 * deliberately.
 *
 * On the main clinic's second floor sit both Exam Room B and Dr. Ama Osei's only
 * practitioner role. Booking at the clinic, the room field offers Exam Room B — a
 * room is sited by walking `partOf` — while the provider field leaves Dr. Osei out,
 * since a provider is sited only by a role naming the site exactly.
 *
 * The rule lives in the schedule search, not in this component.
 * @returns The story.
 */
export const SiteAsymmetryByRole = (): JSX.Element => (
  <Document>
    <Stack gap="md">
      <Alert color="blue" title="Booking at Uro Associates - Main Clinic">
        <Text size="sm">Both sit on the clinic's second floor, one floor inside the site being booked at:</Text>
        <List size="sm" mt="xs">
          <List.Item>
            <b>Exam Room B</b> is offered in the Room field.
          </List.Item>
          <List.Item>
            <b>Dr. Ama Osei</b> is left out of the Provider field, whose only role names the floor rather than the
            clinic.
          </List.Item>
        </List>
      </Alert>
      <AppointmentBookingForm defaultLocation={MainClinic} defaultService={UltrasoundImagingService} />
    </Stack>
  </Document>
);
SiteAsymmetryByRole.decorators = [withFindStub()];
