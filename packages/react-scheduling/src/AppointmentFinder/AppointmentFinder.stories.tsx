// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text, Textarea, TextInput, Title } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import type { Appointment, Bundle, CodeableConcept, Resource } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import { CodeableConceptInput, Document } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { withMockedDate } from '../stories/decorators';
import {
  buildFindBundle,
  buildProposedAppointment,
  DrChenRole,
  DrChenSchedule,
  DrKimRole,
  DrKimSchedule,
  DrMartinezRole,
  DrMartinezSchedule,
  DrOkaforPractitioner,
  DrOkaforSchedule,
  DrRiveraPractitioner,
  DrRiveraSchedule,
  ExamRoomA,
  ExamRoomASchedule,
  ExamRoomB,
  ExamRoomBSchedule,
  MainClinic,
  OperatingRoom3,
  OperatingRoom3Schedule,
  SatelliteClinic,
  SatelliteRoom,
  SatelliteRoomSchedule,
  SecondFloor,
  SurgeryService,
  Ultrasound1Device,
  Ultrasound1Schedule,
  Ultrasound2Device,
  Ultrasound2Schedule,
  UltrasoundImagingService,
  WalkInService,
} from '../stories/scheduling';
import type { AppointmentSelectionOptions } from './AppointmentCustomTimeCard';
import type { AppointmentFinderStep } from './AppointmentFinder';
import { AppointmentFinder } from './AppointmentFinder';

export default {
  title: 'Medplum/AppointmentFinder',
  component: AppointmentFinder,
  decorators: [withMockedDate],
} as Meta;

/** Weekday mornings and early afternoons, in the service's Eastern timezone. */
const OFFERED_HOURS_ET = [9, 9.5, 10, 11, 13, 13.5, 14];

const DAY_MS = 24 * 60 * 60 * 1000;

const SCHEDULES = [
  DrRiveraSchedule,
  DrOkaforSchedule,
  Ultrasound1Schedule,
  Ultrasound2Schedule,
  ExamRoomASchedule,
  ExamRoomBSchedule,
  SatelliteRoomSchedule,
  DrMartinezSchedule,
  DrChenSchedule,
  DrKimSchedule,
  OperatingRoom3Schedule,
];

const SCHEDULE_ACTOR_RESOURCES = [
  DrRiveraPractitioner,
  DrOkaforPractitioner,
  Ultrasound1Device,
  Ultrasound2Device,
  ExamRoomA,
  ExamRoomB,
  SatelliteRoom,
  DrMartinezRole,
  DrChenRole,
  DrKimRole,
  OperatingRoom3,
];

/** Every site and room, so a room's ancestry can be walked up to its clinic. */
const LOCATIONS = [MainClinic, ExamRoomA, SecondFloor, ExamRoomB, SatelliteClinic, SatelliteRoom, OperatingRoom3];

/**
 * Answers the requests the finder makes.
 *
 * MockClient implements neither `Appointment/$find` nor filtered searches in the
 * browser, so the story serves both from its fixtures. What it returns matches
 * the shapes the server produces, so the component runs its real grouping,
 * timezone, and fan-out logic over it.
 * @param url - The request URL.
 * @returns The response, or undefined to let the request through.
 */
function respond(url: URL): Resource | undefined {
  if (url.pathname.endsWith('/Appointment/$find')) {
    return buildFindResponse(url);
  }
  if (url.pathname.endsWith('/Schedule')) {
    return searchset(SCHEDULES, SCHEDULE_ACTOR_RESOURCES);
  }
  if (url.pathname.endsWith('/HealthcareService')) {
    return searchset(byName([UltrasoundImagingService, SurgeryService, WalkInService], url));
  }
  if (url.pathname.endsWith('/Location')) {
    // Only sites are pickable; the rooms inside them are reached through the
    // schedules that hold them.
    return searchset(byName([MainClinic, SatelliteClinic], url));
  }
  return LOCATIONS.find((location) => url.pathname.endsWith(`/Location/${location.id}`));
}

function byName<T extends Resource>(resources: T[], url: URL): T[] {
  const name = url.searchParams.get('name')?.toLowerCase();
  if (!name) {
    return resources;
  }
  return resources.filter((resource) => getDisplayString(resource).toLowerCase().includes(name));
}

function searchset(matches: Resource[], includes: Resource[] = []): Bundle {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: [
      ...matches.map((resource) => ({ resource, search: { mode: 'match' as const } })),
      ...includes.map((resource) => ({ resource, search: { mode: 'include' as const } })),
    ],
  };
}

/**
 * Generates weekday availability over the requested window, the way the server
 * would from the service's SchedulingParameters.
 * @param url - The `$find` request URL.
 * @returns A searchset Bundle of proposed appointments.
 */
function buildFindResponse(url: URL): Bundle<Appointment> {
  const start = new Date(url.searchParams.get('start') as string);
  const end = new Date(url.searchParams.get('end') as string);
  const schedules = url.searchParams.getAll('schedule');
  // The server puts each Schedule's actor on the appointment as it found it,
  // display and all, which is what names the actor on screen.
  const actors = schedules.flatMap(
    (reference) => SCHEDULES.find((schedule) => `Schedule/${schedule.id}` === reference)?.actor ?? []
  );
  const serviceId = (url.searchParams.get('service-type-reference') as string).split('/')[1];
  const durationMinutes = serviceId === SurgeryService.id ? 120 : 30;

  const firstDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const dayCount = Math.ceil((end.getTime() - firstDay) / DAY_MS);

  const appointments: Appointment[] = [];

  for (let index = 0; index < dayCount; index++) {
    const day = new Date(firstDay + index * DAY_MS);
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    for (const hour of OFFERED_HOURS_ET) {
      // Eastern daylight time is UTC-4 in July.
      const slot = new Date(day.getTime() + (hour + 4) * 60 * 60 * 1000);
      if (slot >= start && slot <= end) {
        appointments.push(
          buildProposedAppointment({
            start: slot.toISOString(),
            durationMinutes,
            scheduleReferences: schedules,
            actorReferences: actors,
            serviceId,
          })
        );
      }
    }
  }

  return buildFindBundle(appointments);
}

/**
 * Routes the finder's requests to the fixtures for as long as a story is mounted.
 *
 * Only the scheduling requests are answered here. The patient search goes to the
 * mock client, and finds the patients it keeps.
 *
 * @param props - The React props.
 * @param props.children - The story to render once the routing is in place.
 * @returns The story.
 */
function WithSchedulingData(props: { readonly children: JSX.Element }): JSX.Element | null {
  const medplum = useMedplum();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const passThrough = medplum.get.bind(medplum);
    medplum.get = ((url: string | URL, options: never) => {
      const answer = respond(new URL(url.toString()));
      return answer ? Promise.resolve(answer) : passThrough(url, options);
    }) as typeof medplum.get;

    setReady(true);

    return () => {
      medplum.get = passThrough;
      setReady(false);
    };
  }, [medplum]);

  return ready ? props.children : null;
}

function onSelectAppointment(appointment: Appointment, options: AppointmentSelectionOptions): void {
  console.log(options.available ? 'Selected' : 'Selected an unavailable time', appointment.start, appointment);
}

/**
 * Stands in for the caller's `$book` or `$hold`, slowly enough to show the
 * button waiting on it.
 * @param appointment - The appointment the finder assembled.
 * @param options - Whether the time was one the search offered.
 * @returns A promise that settles once the pretend write is done.
 */
async function onBook(appointment: Appointment, options: AppointmentSelectionOptions): Promise<void> {
  console.log(options.available ? 'Booking' : 'Booking an unavailable time', appointment.start, appointment);
  await new Promise((resolve) => {
    setTimeout(resolve, 750);
  });
  console.log('Booked');
}

export const Basic = (): JSX.Element => (
  <Document>
    <WithSchedulingData>
      <AppointmentFinder onBook={onBook} onSelectAppointment={onSelectAppointment} />
    </WithSchedulingData>
  </Document>
);

export const FixedService = (): JSX.Element => (
  <Document>
    <Title order={3} mb="md">
      Ultrasound Imaging
    </Title>
    <WithSchedulingData>
      <AppointmentFinder
        service={UltrasoundImagingService}
        location={MainClinic}
        patient={HomerSimpson}
        onBook={onBook}
        onSelectAppointment={onSelectAppointment}
      />
    </WithSchedulingData>
  </Document>
);

/**
 * A finder opened at one site, as a clinic's own booking page would be. The
 * site is not asked for and the visit types are the ones held there, but the
 * first step stays: only a fixed service skips it, since there is still a
 * question to answer.
 * @returns The story.
 */
export const FixedLocation = (): JSX.Element => (
  <Document>
    <Title order={3} mb="md">
      Main Clinic
    </Title>
    <WithSchedulingData>
      <AppointmentFinder
        location={MainClinic}
        patient={HomerSimpson}
        onBook={onBook}
        onSelectAppointment={onSelectAppointment}
      />
    </WithSchedulingData>
  </Document>
);

/**
 * A booking that takes a surgeon, an anesthesiologist and an operating room.
 *
 * Its practitioners are PractitionerRoles carrying their role and specialty, so
 * each one is listed with what they do and the field can be searched for the
 * anesthetists. Adding one of each asks for the times all of them are free at
 * once.
 * @returns The story.
 */
export const SurgicalTeam = (): JSX.Element => (
  <Document>
    <Title order={3} mb="md">
      Bariatric Surgery
    </Title>
    <WithSchedulingData>
      <AppointmentFinder
        service={SurgeryService}
        location={MainClinic}
        patient={HomerSimpson}
        onBook={onBook}
        onSelectAppointment={onSelectAppointment}
      />
    </WithSchedulingData>
  </Document>
);

/**
 * A search the caller has opened on a week. It offers what is inside that week
 * and nothing outside it, where an unbounded search reads the whole month and
 * opens on the soonest day of it. The calendar still marks the rest of the month,
 * since a day picked out of it is a search of its own.
 * @returns The story.
 */
export const FixedDateRange = (): JSX.Element => (
  <Document>
    <WithSchedulingData>
      <AppointmentFinder
        service={UltrasoundImagingService}
        defaultDateRange={{ start: new Date(), end: new Date(Date.now() + 7 * DAY_MS) }}
        onBook={onBook}
        onSelectAppointment={onSelectAppointment}
      />
    </WithSchedulingData>
  </Document>
);

/**
 * The step held outside the finder, as an app with a wizard of its own would: it
 * opens where the caller put it and moves only when the caller moves it.
 * @returns The story.
 */
export const CallerOwnedStep = (): JSX.Element => {
  const [step, setStep] = useState<AppointmentFinderStep>('times');
  return (
    <Document>
      <Text size="sm" c="dimmed" mb="md">
        Showing step: {step}
      </Text>
      <WithSchedulingData>
        <AppointmentFinder
          service={UltrasoundImagingService}
          step={step}
          onStepChange={setStep}
          onBook={onBook}
          onSelectAppointment={onSelectAppointment}
        />
      </WithSchedulingData>
    </Document>
  );
};

/**
 * Nothing on offer. A user allowed to ask for a specific time still has a way
 * through; without that, the day is a dead end and another one has to be tried.
 * @returns The story.
 */
export const NoAvailability = (): JSX.Element => (
  <Document>
    <WithSchedulingData>
      <AppointmentFinder
        service={UltrasoundImagingService}
        // A window in the past has nothing to offer, which is what the empty
        // state is for.
        defaultDateRange={{ start: new Date(2019, 0, 5), end: new Date(2019, 0, 6) }}
        allowCustomTime
        onBook={onBook}
        onSelectAppointment={onSelectAppointment}
      />
    </WithSchedulingData>
  </Document>
);

/**
 * A user who may overrule the schedule: a scheduler or a practice manager, say,
 * rather than a patient booking themselves in. They can ask for a time that was
 * not offered and book it over the warning that it may double-book, which is why
 * it is off unless the host turns it on.
 * @returns The story.
 */
export const SpecificTimeRequests = (): JSX.Element => (
  <Document>
    <WithSchedulingData>
      <AppointmentFinder
        service={UltrasoundImagingService}
        location={MainClinic}
        allowCustomTime
        onBook={onBook}
        onSelectAppointment={onSelectAppointment}
      />
    </WithSchedulingData>
  </Document>
);

/**
 * A requested time for a booking that takes several people and a room. The time
 * is held on everyone chosen at once, so the warning names all of them and the
 * theatre is double-booked along with the surgeon. Its length comes from the
 * service rather than from the times on offer, so a request made on a day with
 * nothing on it is still two hours long.
 * @returns The story.
 */
export const SpecificTimeForATeam = (): JSX.Element => (
  <Document>
    <Title order={3} mb="md">
      Bariatric Surgery
    </Title>
    <WithSchedulingData>
      <AppointmentFinder
        service={SurgeryService}
        location={MainClinic}
        patient={HomerSimpson}
        allowCustomTime
        onBook={onBook}
        onSelectAppointment={onSelectAppointment}
      />
    </WithSchedulingData>
  </Document>
);

/** Where this story keeps what R4 has no field for. Its choice, not a recommendation. */
const CPT_EXTENSION = 'https://example.com/fhir/StructureDefinition/cpt-code';
const NOTE_EXTENSION = 'https://example.com/fhir/StructureDefinition/booking-note';

/**
 * A practice that records more than a booking needs: what it will bill for, what
 * it is billing against, and notes of its own.
 *
 * The fields belong to the host, and so does the decision about where their
 * values land on the appointment, taken in `onBook`. A diagnosis has an obvious
 * home in `reasonCode`. A CPT code does not — `serviceType` is the field it would
 * go in, and scheduling has already claimed it to name the service, so writing
 * there would change what is being booked. The extensions below are this story's
 * way out of that, not a recommended one.
 *
 * The last field shows `bookDisabledReason`: while a field the host requires is
 * empty, it says so beside the button and holds it.
 * @returns The story.
 */
export const AdditionalFields = (): JSX.Element => {
  const [procedure, setProcedure] = useState<CodeableConcept | undefined>();
  const [diagnosis, setDiagnosis] = useState<CodeableConcept | undefined>();
  const [note, setNote] = useState('');
  const [required, setRequired] = useState('');

  const book = async (appointment: Appointment, options: AppointmentSelectionOptions): Promise<void> => {
    const extension = [...(appointment.extension ?? [])];
    if (procedure?.coding?.[0]?.code) {
      extension.push({ url: CPT_EXTENSION, valueCodeableConcept: procedure });
    }
    if (note) {
      extension.push({ url: NOTE_EXTENSION, valueString: note });
    }

    await onBook(
      {
        ...appointment,
        reasonCode: diagnosis ? [diagnosis] : appointment.reasonCode,
        extension: extension.length > 0 ? extension : undefined,
      },
      options
    );
  };

  return (
    <Document>
      <WithSchedulingData>
        <AppointmentFinder
          service={UltrasoundImagingService}
          location={MainClinic}
          onBook={book}
          onSelectAppointment={onSelectAppointment}
          bookDisabledReason={required.trim() ? undefined : 'Fill in the required field'}
          additionalFields={
            <>
              <CodeableConceptInput
                name="procedure"
                label="CPT code"
                description="What is being billed for."
                path="Appointment.extension"
                binding="http://www.ama-assn.org/go/cpt"
                onChange={setProcedure}
              />
              <CodeableConceptInput
                name="diagnosis"
                label="ICD-10 diagnosis"
                description="What it is being billed against."
                path="Appointment.reasonCode"
                binding="http://hl7.org/fhir/ValueSet/icd-10"
                onChange={setDiagnosis}
              />
              <Textarea
                label="Scheduling notes"
                description="Kept by the practice, alongside the reason for the visit."
                autosize
                minRows={2}
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
              />
              <TextInput
                label="Required field"
                description="Booking is held until this is filled in."
                required
                value={required}
                onChange={(event) => setRequired(event.currentTarget.value)}
              />
            </>
          }
        />
      </WithSchedulingData>
    </Document>
  );
};
