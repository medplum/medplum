// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Drawer, LoadingOverlay, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { getReferenceString, isReference, isResourceWithId } from '@medplum/core';
import type { Appointment, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum, useResourceModified } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Calendar } from '../../components/Calendar';
import { AppointmentDetails } from '../../components/schedule/AppointmentDetails';
import { CreateVisit } from '../../components/schedule/CreateVisit';
import { useSchedulingResources } from '../../hooks/useSchedulingResources';
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

  const [appointmentSlot, setAppointmentSlot] = useState<Range>();
  const [appointmentDetails, setAppointmentDetails] = useState<WithId<Appointment> | undefined>(undefined);

  const { slots, appointments, loading } = useSchedulingResources([schedule], range);

  const practitioner = schedule.actor.find((actor) => isReference<Practitioner>(actor, 'Practitioner'));

  useResourceModified('Appointment', (event) => {
    if (event.id !== appointmentDetails?.id) {
      return;
    }
    setAppointmentDetails(event.resource);

    // If the selected appointment was cancelled or deleted, close the drawer.
    if (!event || event.resource?.status === 'cancelled') {
      appointmentDetailsHandlers.close();
    }
  });

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
          <Box pos="relative" h="100%">
            <LoadingOverlay visible={loading} />
            <Calendar
              onSelectInterval={handleSelectInterval}
              onSelectAppointment={handleSelectAppointment}
              onSelectSlot={handleSelectSlot}
              slots={mergedSlots}
              appointments={appointments ?? []}
              onRangeChange={setRange}
              onDoubleClickAppointment={handleDoubleClickAppointment}
            />
          </Box>
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
