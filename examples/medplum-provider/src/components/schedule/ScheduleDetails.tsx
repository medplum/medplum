// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Drawer, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { EMPTY, getReferenceString, isDefined, isReference, isResourceWithId, resolveId } from '@medplum/core';
import type { Appointment, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
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

  useEffect(() => {
    if (!range) {
      return () => {};
    }
    let active = true;

    medplum
      .searchResources('Slot', [
        ['_count', '1000'],
        ['schedule', getReferenceString(schedule)],
        ['start', `ge${range.start.toISOString()}`],
        ['start', `le${range.end.toISOString()}`],
        ['status:not', 'entered-in-error'],
      ])
      .then((rawSlots) => active && setSlots(rawSlots))
      .catch((error: unknown) => active && showErrorNotification(error));

    return () => {
      active = false;
    };
  }, [medplum, schedule, range]);

  // Find appointments visible in the current range
  useEffect(() => {
    const actorRef = schedule.actor[0]?.reference;
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
  }, [medplum, schedule, range]);

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

  const handleBookSuccess = useCallback(
    (results: { appointment: WithId<Appointment>; slots: Slot[] }) => {
      setAppointments((state) => [...(state ?? EMPTY), results.appointment]);
      setAppointmentDetails(results.appointment);
      appointmentDetailsHandlers.open();
      setSlots((state) => results.slots.concat(state ?? EMPTY));
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

  const handleAppointmentUpdate = useCallback(
    (updated: WithId<Appointment>) => {
      setAppointments((state) => (state ?? []).map((existing) => (existing.id === updated.id ? updated : existing)));
      setAppointmentDetails((existing) => (existing?.id === updated.id ? updated : existing));
      if (updated.status === 'cancelled') {
        appointmentDetailsHandlers.close();

        // If the appointment was cancelled with `$cancel`, it also
        // soft-deleted the related slots. Remove them from our local state.
        if (updated.slot) {
          const ids = new Set(updated.slot.map((ref) => resolveId(ref)).filter(isDefined));
          setSlots((state) => state?.filter((slot) => slot.id && !ids.has(slot.id)));
        }
      }
    },
    [appointmentDetailsHandlers]
  );

  const handleSlotUpdate = useCallback((updated: WithId<Slot>) => {
    setSlots((state) => (state ?? []).map((existing) => (existing.id === updated.id ? updated : existing)));
  }, []);

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
        {appointmentDetails && (
          <AppointmentDetails
            appointment={appointmentDetails}
            onAppointmentUpdate={handleAppointmentUpdate}
            onSlotUpdate={handleSlotUpdate}
          />
        )}
      </Drawer>
    </>
  );
}
