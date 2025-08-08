// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getReferenceString } from '@medplum/core';
import { Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { Document, Loading, useMedplum, useMedplumProfile, usePrevious } from '@medplum/react';
import dayjs from 'dayjs';
import { JSX, useCallback, useContext, useEffect, useState } from 'react';
import { Calendar, dayjsLocalizer, Event } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useParams } from 'react-router';
import { CreateAppointment } from '../components/actions/CreateAppointment';
import { ScheduleContext } from '../Schedule.context';

/**
 * PatientSchedulePage component that displays the practitioner's schedule as part of the
 * appointment creation flow for a patient.
 * Allows the practitioner to select a slot to create an appointment for a patient.
 * @returns A React component that displays the patient schedule page.
 */
export function PatientSchedulePage(): JSX.Element {
  const { patientId } = useParams();

  const [createAppointmentOpened, createAppointmentHandlers] = useDisclosure(false);
  const [selectedEvent, setSelectedEvent] = useState<Event>();

  const medplum = useMedplum();
  const patient = patientId ? medplum.readResource('Patient', patientId).read() : undefined;

  const { schedule } = useContext(ScheduleContext);
  const profile = useMedplumProfile() as Practitioner;

  const prevSchedule = usePrevious(schedule);
  const prevProfile = usePrevious(profile);

  const [shouldRefreshCalender, setShouldRefreshCalender] = useState(true);

  const [slots, setSlots] = useState<Slot[]>();

  useEffect(() => {
    if ((schedule && prevSchedule?.id !== schedule?.id) || (profile && prevProfile?.id !== profile?.id)) {
      setShouldRefreshCalender(true);
    }
  }, [schedule, profile, prevSchedule?.id, prevProfile?.id]);

  useEffect(() => {
    async function searchSlots(): Promise<void> {
      const slots = await medplum.searchResources(
        'Slot',
        {
          schedule: getReferenceString(schedule as Schedule),
          _count: '100',
        },
        { cache: 'no-cache' }
      );
      setSlots(slots);
    }

    if (shouldRefreshCalender) {
      searchSlots()
        .then(() => setShouldRefreshCalender(false))
        .catch(console.error);
    }
  }, [medplum, schedule, shouldRefreshCalender]);

  // Converts Slot resources to big-calendar Event objects
  // Only show free slots (available for booking)
  const slotEvents: Event[] = (slots ?? [])
    .filter((slot) => slot.status === 'free')
    .map((slot) => ({
      title: slot.status === 'free' ? 'Available' : 'Blocked',
      start: new Date(slot.start),
      end: new Date(slot.end),
      resource: slot,
    }));

  /**
   * When an exiting event (slot) is selected, set the event object and open the create appointment
   * modal.
   */
  const handleSelectEvent = useCallback(
    (event: Event) => {
      setSelectedEvent(event);
      createAppointmentHandlers.open();
    },
    [createAppointmentHandlers]
  );

  if (!patientId) {
    return <Loading />;
  }

  return (
    <Document width={1000}>
      <Title order={1} mb="lg">
        Select a slot for the appointment
      </Title>

      <Calendar
        defaultView="week"
        views={['week', 'day']}
        localizer={dayjsLocalizer(dayjs)}
        backgroundEvents={slotEvents} // Background events don't show in the month view
        onSelectEvent={handleSelectEvent}
        scrollToTime={new Date()} // Default scroll to current time
        style={{ height: 600 }}
      />

      <CreateAppointment
        patient={patient}
        event={selectedEvent}
        opened={createAppointmentOpened}
        handlers={createAppointmentHandlers}
        onAppointmentsUpdated={() => setShouldRefreshCalender(true)}
      />
    </Document>
  );
}
