// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Center, Drawer, Loader, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createReference, EMPTY, isDefined, getReferenceString } from '@medplum/core';
import type { WithId } from '@medplum/core';
import type { Appointment, Bundle, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { SlotInfo } from 'react-big-calendar';
import { useNavigate } from 'react-router';
import { AppointmentDetails } from '../../components/schedule/AppointmentDetails';
import { CreateVisit } from '../../components/schedule/CreateVisit';
import { showErrorNotification } from '../../utils/notifications';
import { Calendar } from '../../components/Calendar';
import { mergeOverlappingSlots } from '../../utils/slots';
import type { Range } from '../../types/scheduling';
import classes from './SchedulePage.module.css';
import { serviceTypesFromSchedulingParameters, SchedulingTransientIdentifier } from '../../utils/scheduling';
import { FindPane } from './FindPane';

/**
 * Schedule page that displays the practitioner's schedule.
 * Allows the practitioner to create/update slots and create appointments.
 * @returns A React component that displays the schedule page.
 */
export function SchedulePage(): JSX.Element | null {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const [createAppointmentOpened, createAppointmentHandlers] = useDisclosure(false);
  const [appointmentDetailsOpened, appointmentDetailsHandlers] = useDisclosure(false);
  const [schedule, setSchedule] = useState<WithId<Schedule> | undefined>();
  const [range, setRange] = useState<Range | undefined>(undefined);
  const [slots, setSlots] = useState<Slot[] | undefined>(undefined);
  const [appointments, setAppointments] = useState<Appointment[] | undefined>(undefined);

  const [appointmentSlot, setAppointmentSlot] = useState<Range>();
  const [appointmentDetails, setAppointmentDetails] = useState<Appointment | undefined>(undefined);

  useEffect(() => {
    if (medplum.isLoading() || !profile) {
      return;
    }

    // Search for a Schedule associated with the logged user,
    // create one if it doesn't exist
    medplum
      .searchOne('Schedule', { actor: getReferenceString(profile) })
      .then((foundSchedule) => {
        if (foundSchedule) {
          setSchedule(foundSchedule);
        } else {
          medplum
            .createResource({
              resourceType: 'Schedule',
              actor: [createReference(profile)],
              active: true,
            })
            .then(setSchedule)
            .catch(showErrorNotification);
        }
      })
      .catch(showErrorNotification);
  }, [medplum, profile]);

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
    if (!profile || !range) {
      return () => {};
    }
    let active = true;

    medplum
      .searchResources('Appointment', [
        ['_count', '1000'],
        ['actor', getReferenceString(profile as WithId<Practitioner>)],
        ['date', `ge${range.start.toISOString()}`],
        ['date', `le${range.end.toISOString()}`],
      ])
      .then((appointments) => active && setAppointments(appointments))
      .catch((error: unknown) => active && showErrorNotification(error));

    return () => {
      active = false;
    };
  }, [medplum, profile, range]);

  // When a date/time interval is selected, set the event object and open the
  // create appointment modal
  const handleSelectInterval = useCallback(
    (slot: SlotInfo) => {
      createAppointmentHandlers.open();
      setAppointmentSlot(slot);
    },
    [createAppointmentHandlers]
  );

  const bookSlot = useCallback(
    async (slot: Slot) => {
      const data = await medplum.post<Bundle<Appointment | Slot>>(medplum.fhirUrl('Appointment', '$book'), {
        resourceType: 'Parameters',
        parameter: [{ name: 'slot', resource: slot }],
      });
      medplum.invalidateSearches('Appointment');
      medplum.invalidateSearches('Slot');

      // Add the $book response to our state
      const resources = data.entry?.map((entry) => entry.resource).filter(isDefined) ?? EMPTY;
      const slots = resources
        .filter((obj: Slot | Appointment): obj is Slot => obj.resourceType === 'Slot')
        .filter((slot) => slot.status !== 'busy');
      const appointments = resources.filter(
        (obj: Slot | Appointment): obj is Appointment => obj.resourceType === 'Appointment'
      );
      setAppointments((state) => appointments.concat(state ?? EMPTY));
      setSlots((state) => slots.concat(state ?? EMPTY));

      // Open the appointment details drawer for the resource we just created
      const firstAppointment = appointments[0];
      if (firstAppointment) {
        setAppointmentDetails(firstAppointment);
        appointmentDetailsHandlers.open();
      }
    },
    [medplum, appointmentDetailsHandlers]
  );

  const [bookLoading, setBookLoading] = useState(false);

  const handleSelectSlot = useCallback(
    (slot: Slot) => {
      // If selecting a slot from "$find", run it through "$book" to create an
      // appointment and slots
      if (SchedulingTransientIdentifier.get(slot)) {
        setBookLoading(true);
        bookSlot(slot)
          .catch(showErrorNotification)
          .finally(() => setBookLoading(false));
        return;
      }

      // When a "free" slot is selected, open the create appointment modal
      if (slot.status === 'free') {
        createAppointmentHandlers.open();
        setAppointmentSlot({ start: new Date(slot.start), end: new Date(slot.end) });
      }
    },
    [createAppointmentHandlers, bookSlot]
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

  return (
    <Box pos="relative" bg="white" p="md" style={{ height }}>
      <div className={classes.container}>
        <div className={classes.calendar}>
          <Calendar
            style={{ height: height - 150 }}
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
            <FindPane
              key={schedule.id}
              schedule={schedule}
              range={range}
              onSelectSlot={(slot) => handleSelectSlot(slot)}
            />
            {bookLoading && (
              <Center>
                <Loader />
              </Center>
            )}
          </Stack>
        )}
      </div>

      {/* Modals */}
      <Drawer
        opened={createAppointmentOpened}
        onClose={createAppointmentHandlers.close}
        title="New Calendar Event"
        position="right"
        h="100%"
      >
        <CreateVisit appointmentSlot={appointmentSlot} />
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
