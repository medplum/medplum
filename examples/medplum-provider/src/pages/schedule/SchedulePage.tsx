// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Drawer, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import {
  createReference,
  EMPTY,
  getReferenceString,
  isDefined,
  isReference,
  isResourceWithId,
  resolveId,
} from '@medplum/core';
import type { Appointment, Practitioner, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import { ReferenceInput, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconSettings } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Calendar } from '../../components/Calendar';
import { AppointmentDetails } from '../../components/schedule/AppointmentDetails';
import { CreateVisit } from '../../components/schedule/CreateVisit';
import type { Range } from '../../types/scheduling';
import { showErrorNotification } from '../../utils/notifications';
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
  const project = medplum.getProject();

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
  const [appointments, setAppointments] = useState<WithId<Appointment>[] | undefined>(undefined);

  const [appointmentSlot, setAppointmentSlot] = useState<Range>();
  const [appointmentDetails, setAppointmentDetails] = useState<WithId<Appointment> | undefined>(undefined);

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

  const practitioner = schedule?.actor.find((actor) => isReference<Practitioner>(actor, 'Practitioner'));

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

  // When an appointment is selected, navigate to the detail page
  const handleSelectAppointment = useCallback(
    async (appointment: Appointment) => {
      if (!isResourceWithId(appointment)) {
        showErrorNotification("Can't navigate to unsaved appointment");
        return;
      }
      const reference = getReferenceString(appointment);

      try {
        const encounter = await medplum.searchOne('Encounter', [['appointment', reference]]);

        if (!encounter) {
          setAppointmentDetails(appointment);
          appointmentDetailsHandlers.open();
          return;
        }

        const patient = encounter.subject;
        if (patient?.reference) {
          await navigate(`/${patient.reference}/Encounter/${encounter.id}`);
        }
      } catch (error) {
        showErrorNotification(error);
      }
    },
    [medplum, navigate, appointmentDetailsHandlers]
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

  const schedulingEnabled = project?.features?.includes('scheduling');

  const mergedSlots = useMemo(() => mergeOverlappingSlots(slots ?? []), [slots]);

  return (
    <>
      <Stack p="sm" className={classes.page}>
        <Group justify="space-between">
          <Box w={320}>
            <ReferenceInput
              key={schedule?.id}
              name="schedule-actor"
              targetTypes={['Practitioner']}
              placeholder="Switch schedule..."
              defaultValue={schedule?.actor?.[0] as Reference<Practitioner>}
              onChange={handleActorChange}
            />
          </Box>
          {schedule && schedulingEnabled && (
            <ActionIcon
              variant="subtle"
              aria-label="Schedule settings"
              onClick={() => navigate(`/Calendar/Schedule/${schedule.id}/settings`)}
            >
              <IconSettings />
            </ActionIcon>
          )}
        </Group>
        <div className={classes.container}>
          <Calendar
            onSelectInterval={handleSelectInterval}
            onSelectAppointment={handleSelectAppointment}
            onSelectSlot={handleSelectSlot}
            slots={mergedSlots}
            appointments={appointments ?? []}
            onRangeChange={setRange}
            className={classes.calendar}
          />

          {schedule && range && (
            <FindPane
              key={schedule.id}
              schedule={schedule}
              range={range}
              onSuccess={handleBookSuccess}
              className={classes.findPane}
            />
          )}
        </div>
      </Stack>

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
