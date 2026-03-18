// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Drawer, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { createReference, EMPTY, getReferenceString } from '@medplum/core';
import type { Appointment, Practitioner, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import { ReferenceInput, useMedplum, useMedplumProfile } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SlotInfo } from 'react-big-calendar';
import { useNavigate, useParams } from 'react-router';
import { Calendar } from '../../components/Calendar';
import { AppointmentDetails } from '../../components/schedule/AppointmentDetails';
import { CreateVisit } from '../../components/schedule/CreateVisit';
import type { Range } from '../../types/scheduling';
import { showErrorNotification } from '../../utils/notifications';
import { serviceTypesFromSchedulingParameters } from '../../utils/scheduling';
import { mergeOverlappingSlots } from '../../utils/slots';
import { FindPane } from './FindPane';
import classes from './SchedulePage.module.css';

/**
 * Schedule page that displays the practitioner's schedule.
 * Allows the practitioner to create/update slots and create appointments.
 * @returns A React component that displays the schedule page.
 */
export function SchedulePage(): JSX.Element | null {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;

  // Redirect to the current user's schedule if no id in the URL
  useEffect(() => {
    if (id || !profile?.id) {
      return;
    }
    medplum
      .searchOne('Schedule', { actor: getReferenceString(profile as WithId<Practitioner>) })
      .then((foundSchedule) => {
        if (foundSchedule?.id) {
          navigate(`/Calendar/Schedule/${foundSchedule.id}`, { replace: true })?.catch(console.log);
        } else {
          medplum
            .createResource({
              resourceType: 'Schedule',
              actor: [createReference(profile as WithId<Practitioner>)],
              active: true,
            })
            .then((created) => {
              navigate(`/Calendar/Schedule/${created.id}`, { replace: true })?.catch(console.log);
            })
            .catch(showErrorNotification);
        }
      })
      .catch(showErrorNotification);
  }, [id, profile, medplum, navigate]);
  const [createAppointmentOpened, createAppointmentHandlers] = useDisclosure(false);
  const [appointmentDetailsOpened, appointmentDetailsHandlers] = useDisclosure(false);
  const [schedule, setSchedule] = useState<WithId<Schedule> | undefined>();
  const [range, setRange] = useState<Range | undefined>(undefined);
  const [slots, setSlots] = useState<Slot[] | undefined>(undefined);
  const [appointments, setAppointments] = useState<Appointment[] | undefined>(undefined);

  const [appointmentSlot, setAppointmentSlot] = useState<Range>();
  const [appointmentDetails, setAppointmentDetails] = useState<Appointment | undefined>(undefined);

  // Load the schedule directly from the URL param
  useEffect(() => {
    if (!id) {
      return;
    }
    setSchedule(undefined);
    medplum.readResource('Schedule', id).then(setSchedule).catch(showErrorNotification);
  }, [id, medplum]);

  // Find slots visible in the current range
  useEffect(() => {
    if (!schedule || !range) {
      return () => {};
    }
    let active = true;

    medplum
      .searchResources('Slot', [
        ['_count', '1000'],
        ['schedule', getReferenceString(schedule)],
        ['start', `ge${range.start.toISOString()}`],
        ['start', `le${range.end.toISOString()}`],
        ['status', 'free,busy-unavailable'],
      ])
      .then((rawSlots) => active && setSlots(mergeOverlappingSlots(rawSlots)))
      .catch((error: unknown) => active && showErrorNotification(error));

    return () => {
      active = false;
    };
  }, [medplum, schedule, range]);

  // Find appointments visible in the current range
  useEffect(() => {
    const actorRef = schedule?.actor?.[0]?.reference;
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

  // When a date/time interval is selected, set the event object and open the
  // create appointment modal
  const handleSelectInterval = useCallback(
    (slot: SlotInfo) => {
      createAppointmentHandlers.open();
      setAppointmentSlot(slot);
    },
    [createAppointmentHandlers]
  );

  const handleSelectSlot = useCallback(
    (slot: Slot) => {
      // When a "free" slot is selected, open the create appointment modal
      if (slot.status === 'free') {
        createAppointmentHandlers.open();
        setAppointmentSlot({ start: new Date(slot.start), end: new Date(slot.end) });
      }
    },
    [createAppointmentHandlers]
  );

  const handleBookSuccess = useCallback(
    (results: { appointments: Appointment[]; slots: Slot[] }) => {
      setAppointments((state) => results.appointments.concat(state ?? EMPTY));
      setAppointmentDetails(results.appointments[0]);
      appointmentDetailsHandlers.open();
      setSlots((state) =>
        results.slots
          .filter(
            // We don't show "busy" slots, assuming that they are duplicative of
            // more descriptive Appointment resources.
            (slot) => slot.status !== 'busy'
          )
          .concat(state ?? EMPTY)
      );
    },
    [appointmentDetailsHandlers]
  );

  // When an appointment is selected, navigate to the detail page
  const handleSelectAppointment = useCallback(
    async (appointment: Appointment) => {
      const reference = getReferenceString(appointment);
      if (!reference) {
        showErrorNotification("Can't navigate to unsaved appointment");
        return;
      }

      try {
        const encounters = await medplum.searchResources('Encounter', [
          ['appointment', reference],
          ['_count', '1'],
        ]);

        if (encounters.length === 0) {
          setAppointmentDetails(appointment);
          appointmentDetailsHandlers.open();
          return;
        }

        const patient = encounters?.[0]?.subject;
        if (patient?.reference) {
          await navigate(`/${patient.reference}/Encounter/${encounters?.[0]?.id}`);
        }
      } catch (error) {
        showErrorNotification(error);
      }
    },
    [medplum, navigate, appointmentDetailsHandlers]
  );

  const height = window.innerHeight - 60;
  const serviceTypes = useMemo(() => schedule && serviceTypesFromSchedulingParameters(schedule), [schedule]);

  const handleAppointmentUpdate = useCallback((updated: Appointment) => {
    setAppointments((state) => (state ?? []).map((existing) => (existing.id === updated.id ? updated : existing)));
    setAppointmentDetails((existing) => (existing?.id === updated.id ? updated : existing));
  }, []);

  const handleActorChange = useCallback(
    (ref: Reference | undefined) => {
      if (!ref?.reference) {
        return;
      }
      medplum
        .searchOne('Schedule', { actor: ref.reference })
        .then((foundSchedule) => {
          if (foundSchedule?.id) {
            navigate(`/Calendar/Schedule/${foundSchedule.id}`)?.catch(console.error);
          }
        })
        .catch(showErrorNotification);
    },
    [medplum, navigate]
  );

  return (
    <Box pos="relative" bg="white" p="md" style={{ height }}>
      <div className={classes.wrapper}>
        <Box mb="sm" maw={320}>
          <ReferenceInput
            key={schedule?.id}
            name="schedule-actor"
            targetTypes={['Practitioner']}
            placeholder="Switch schedule..."
            defaultValue={schedule?.actor?.[0] as Reference<Practitioner>}
            onChange={handleActorChange}
          />
        </Box>
        <div className={classes.container}>
          <div className={classes.calendar}>
            <Calendar
              style={{ height: '100%' }}
              onSelectInterval={handleSelectInterval}
              onSelectAppointment={handleSelectAppointment}
              onSelectSlot={handleSelectSlot}
              slots={slots ?? []}
              appointments={appointments ?? []}
              onRangeChange={setRange}
            />
          </div>

          {Boolean(serviceTypes?.length) && schedule && range && (
            <Stack gap="md" justify="space-between" className={classes.findPane}>
              <FindPane key={schedule.id} schedule={schedule} range={range} onSuccess={handleBookSuccess} />
            </Stack>
          )}
        </div>
      </div>

      {/* Modals */}
      <Drawer
        opened={createAppointmentOpened}
        onClose={createAppointmentHandlers.close}
        title="New Calendar Event"
        position="right"
        h="100%"
      >
        <CreateVisit appointmentSlot={appointmentSlot} schedule={schedule} />
      </Drawer>
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
          <AppointmentDetails appointment={appointmentDetails} onUpdate={handleAppointmentUpdate} />
        )}
      </Drawer>
    </Box>
  );
}
