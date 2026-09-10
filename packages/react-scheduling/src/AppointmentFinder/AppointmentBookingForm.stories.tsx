// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, List, Stack, Text } from '@mantine/core';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { withBookStub, withFindStub, withFixtures, withMockedDate } from '../stories/decorators';
import {
  MainClinic,
  MRN_SYSTEM,
  PatientFixtures,
  SchedulingFixtures,
  SubClinicProviderFixtures,
  SurgeryService,
  SurgicalFixtures,
  UltrasoundImagingService,
} from '../stories/scheduling';
import type { AppointmentBooking } from './AppointmentBookingForm';
import { AppointmentBookingForm } from './AppointmentBookingForm';

const STORY_FIXTURES = [...SchedulingFixtures, ...SurgicalFixtures, ...SubClinicProviderFixtures, ...PatientFixtures];

/**
 * Stands in for the host, which is the only thing a story has to supply.
 * @param booking - What the form wrote.
 */
function reportBooking(booking: AppointmentBooking): void {
  console.info('Booked', booking.appointment.id, `over ${booking.slots.length} slot(s)`);
}

// A story's own decorators add to these rather than replacing them, so `$find` is
// stubbed per story: two stubs would both install, and which one answered would be
// an accident of effect ordering.
export default {
  title: 'Medplum/AppointmentBookingForm',
  component: AppointmentBookingForm,
  decorators: [withBookStub(), withFixtures(STORY_FIXTURES), withMockedDate],
} as Meta;

/**
 * The whole form, mounted the way a host with no configuration mounts it:
 * `onBooked` and nothing else.
 *
 * Choose "Ultrasound Imaging" and the three role fields search against it: it is
 * held on practitioners, rooms and devices, and only the provider is required. So
 * "Find a time" stays unusable until a provider is named, and says so.
 *
 * Change a resource with a time already picked and the time goes — it was found for
 * resources that no longer stand — while the search stays open and re-runs, so the
 * replacement is one click away.
 *
 * Name a patient and "Book appointment" writes the visit. Two patients here are
 * called Jordan Reyes, which is what the birth date and medical record number under
 * each name are for.
 * @returns The story.
 */
export const Basic = (): JSX.Element => (
  <Document>
    <AppointmentBookingForm onBooked={reportBooking} />
  </Document>
);
Basic.decorators = [withFindStub()];

/**
 * A project whose identifiers carry no `type`, so nothing on an identifier says
 * which one is the medical record number.
 *
 * `mrnSystem` is what names it. Search "Sam" and the number appears under the
 * name; drop the prop and the same patient lists by name and birth date alone.
 * @returns The story.
 */
export const UntypedMedicalRecordNumbers = (): JSX.Element => (
  <Document>
    <AppointmentBookingForm mrnSystem={MRN_SYSTEM} onBooked={reportBooking} />
  </Document>
);
UntypedMedicalRecordNumbers.decorators = [withFindStub()];

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
    <AppointmentBookingForm defaultService={SurgeryService} defaultLocation={MainClinic} onBooked={reportBooking} />
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
    <AppointmentBookingForm onBooked={reportBooking} />
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
      <AppointmentBookingForm
        defaultLocation={MainClinic}
        defaultService={UltrasoundImagingService}
        onBooked={reportBooking}
      />
    </Stack>
  </Document>
);
SiteAsymmetryByRole.decorators = [withFindStub()];
