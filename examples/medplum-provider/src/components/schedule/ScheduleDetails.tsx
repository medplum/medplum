// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Drawer, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { getReferenceString, isReference, isResourceWithId } from '@medplum/core';
import type { Appointment, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum, useResourceModified } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Calendar } from '../../components/Calendar';
import { AppointmentDetails } from '../../components/schedule/AppointmentDetails';
import { CreateVisit } from '../../components/schedule/CreateVisit';
import type { Range } from '../../types/scheduling';
import { encounterUrl } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { mergeOverlappingSlots } from '../../utils/slots';
import { FindPane } from './FindPane';
import classes from './ScheduleDetails.module.css';

export interface ScheduleDetailsProps {
  schedule: WithId<Schedule>;
}

export function ScheduleDetails(props: ScheduleDetailsProps): JSX.Element | null {
  const { schedule } = props;
  const navigate = useNavigate();
  const medplum = useMedplum();

  const [createAppointmentOpened, createAppointmentHandlers] = useDisclosure(false);
  const [appointmentDetailsOpened, appointmentDetailsHandlers] = useDisclosure(false);
  const [range, setRange] = useState<Range | undefined>(undefined);
  const [slots, setSlots] = useState<Slot[] | undefined>(undefined);
  const [appointments, setAppointments] = useState<WithId<Appointment>[] | undefined>(undefined);

  const [appointmentSlot, setAppointmentSlot] = useState<Range>();
  const [appointmentDetails, setAppointmentDetails] = useState<WithId<Appointment> | undefined>(undefined);

  // The predicates that scope this calendar's data. Both the searches below and the
  // `useResourceModified` handlers use these so the optimistic updates stay consistent
  // with what a refetch would return.
  const scheduleRef = getReferenceString(schedule);
  const actorRef = schedule.actor[0]?.reference;

  // Keep the calendar's slots in sync with any Slot this client modifies, e.g. the
  // slots created when booking a visit from the FindPane or soft-deleted when cancelling
  // one from the appointment details drawer.
  useResourceModified('Slot', (event) => {
    if (event.operation === 'delete') {
      // Deletes don't carry a resource, only the id of what went away.
      if (event.id) {
        setSlots((state) => state?.filter((slot) => slot.id !== event.id));
      }
      return;
    }

    const slot = event.resource;
    if (!slot) {
      return;
    }
    // Ignore slots that belong to a different schedule than the one shown here.
    if (slot.schedule.reference !== scheduleRef) {
      return;
    }

    setSlots((state) => {
      // `create` prepends the new slot; `update`/`patch` replace it in place and leave
      // an unloaded range untouched.
      if (event.operation === 'create') {
        const current = state ?? [];
        return current.some((existing) => existing.id === slot.id) ? current : [slot, ...current];
      }
      return state?.map((existing) => (existing.id === slot.id ? slot : existing));
    });
  });

  // Likewise keep the calendar's appointments in sync with any Appointment this client
  // modifies, and mirror the change into the open appointment details drawer.
  useResourceModified('Appointment', (event) => {
    if (event.operation === 'delete') {
      if (event.id) {
        setAppointments((state) => state?.filter((appointment) => appointment.id !== event.id));
        setAppointmentDetails((existing) => (existing?.id === event.id ? undefined : existing));
      }
      return;
    }

    const appointment = event.resource;
    if (!appointment) {
      return;
    }
    // Ignore appointments that don't involve this schedule's actor, mirroring the
    // `actor` filter used by the search below.
    if (!actorRef || !appointment.participant.some((p) => p.actor?.reference === actorRef)) {
      return;
    }

    setAppointments((state) => {
      if (event.operation === 'create') {
        const current = state ?? [];
        return current.some((existing) => existing.id === appointment.id) ? current : [...current, appointment];
      }
      return state?.map((existing) => (existing.id === appointment.id ? appointment : existing));
    });
    setAppointmentDetails((existing) => (existing?.id === appointment.id ? appointment : existing));
    // A cancelled appointment can no longer be acted on, so close its details drawer.
    if (appointment.status === 'cancelled') {
      appointmentDetailsHandlers.close();
    }
  });

  useEffect(() => {
    if (!range) {
      return () => {};
    }
    let active = true;

    medplum
      .searchResources('Slot', [
        ['_count', '1000'],
        ['schedule', scheduleRef],
        ['start', `ge${range.start.toISOString()}`],
        ['start', `le${range.end.toISOString()}`],
        ['status:not', 'entered-in-error'],
      ])
      .then((rawSlots) => active && setSlots(rawSlots))
      .catch((error: unknown) => active && showErrorNotification(error));

    return () => {
      active = false;
    };
  }, [medplum, scheduleRef, range]);

  // Find appointments visible in the current range
  useEffect(() => {
    if (!actorRef || !range) {
      return () => {};
    }
    let active = true;

    medplum
      .searchResources('Appointment', [
        ['_count', '1000'],
        ['actor', actorRef],
        ['date', `ge${range.start.toISOString()}`],
        ['date', `le${range.end.toISOString()}`],
      ])
      .then((appointments) => active && setAppointments(appointments))
      .catch((error: unknown) => active && showErrorNotification(error));

    return () => {
      active = false;
    };
  }, [medplum, actorRef, range]);

  const practitioner = schedule.actor.find((actor) => isReference<Practitioner>(actor, 'Practitioner'));

  // When a date/time interval is selected, set the event object and open the
  // create appointment modal
  const handleSelectInterval = useCallback(
    (slot: Range) => {
      if (!practitioner) {
        showErrorNotification("Can't create visit without associated Practitioner");
        return;
      }

      createAppointmentHandlers.open();
      setAppointmentSlot(slot);
    },
    [createAppointmentHandlers, practitioner]
  );

  const handleSelectSlot = useCallback(
    (slot: Slot) => {
      if (!practitioner) {
        showErrorNotification("Can't create visit without associated Practitioner");
        return;
      }

      // When a "free" slot is selected, open the create appointment modal
      if (slot.status === 'free') {
        createAppointmentHandlers.open();
        setAppointmentSlot({ start: new Date(slot.start), end: new Date(slot.end) });
      }
    },
    [createAppointmentHandlers, practitioner]
  );

  // The calendar's slots and appointments update through the `useResourceModified`
  // subscriptions above; this callback only handles the UI response to a successful booking.
  const handleBookSuccess = useCallback(
    (results: { appointment: WithId<Appointment>; slots: Slot[] }) => {
      setAppointmentDetails(results.appointment);
      appointmentDetailsHandlers.open();
    },
    [appointmentDetailsHandlers]
  );

  const handleSelectAppointment = useCallback(
    (appointment: Appointment) => {
      if (!isResourceWithId(appointment)) {
        showErrorNotification("Can't navigate to unsaved appointment");
        return;
      }
      setAppointmentDetails(appointment);
      appointmentDetailsHandlers.open();
    },
    [appointmentDetailsHandlers]
  );

  // On appointment double click, check if there is a related Encounter we can
  // jump to. If not, we let the `handleSelectAppointment` handler show the
  // appointment details drawer and don't need to take any action here.
  const handleDoubleClickAppointment = useCallback(
    async (appointment: Appointment) => {
      if (!isResourceWithId(appointment)) {
        showErrorNotification("Can't navigate to unsaved appointment");
        return;
      }
      try {
        const encounter = await medplum.searchOne('Encounter', { appointment: getReferenceString(appointment) });
        if (encounter) {
          await navigate(encounterUrl(encounter));
        }
      } catch (error) {
        showErrorNotification(error);
      }
    },
    [medplum, navigate]
  );

  const mergedSlots = useMemo(() => mergeOverlappingSlots(slots ?? []), [slots]);

  return (
    <>
      <div className={classes.container}>
        <Stack className={classes.calendarPane}>
          <Calendar
            onSelectInterval={handleSelectInterval}
            onSelectAppointment={handleSelectAppointment}
            onSelectSlot={handleSelectSlot}
            slots={mergedSlots}
            appointments={appointments ?? []}
            onRangeChange={setRange}
            onDoubleClickAppointment={handleDoubleClickAppointment}
          />
          <Text size="sm" color="dimmed" fs="italic">
            Hint: Double-click on an appointment to jump to the encounter details.
          </Text>
        </Stack>

        {range && (
          <FindPane
            key={schedule.id}
            schedule={schedule}
            range={range}
            onSuccess={handleBookSuccess}
            className={classes.findPane}
          />
        )}
      </div>

      {/* Modals */}
      {practitioner && (
        <Drawer
          opened={createAppointmentOpened}
          onClose={createAppointmentHandlers.close}
          title="New Calendar Event"
          position="right"
          h="100%"
        >
          <CreateVisit appointmentSlot={appointmentSlot} schedule={schedule} practitioner={practitioner} />
        </Drawer>
      )}
      <Drawer
        opened={appointmentDetailsOpened}
        onClose={appointmentDetailsHandlers.close}
        title={
          <Text size="xl" fw={700}>
            Appointment Details
          </Text>
        }
        position="right"
        h="100%"
      >
        {appointmentDetails && <AppointmentDetails appointment={appointmentDetails} />}
      </Drawer>
    </>
  );
}
