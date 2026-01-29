// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Drawer, Group, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  createReference,
  EMPTY,
  isDefined,
  formatDateTime,
  getExtensionValue,
  getReferenceString,
} from '@medplum/core';
import type { WithId } from '@medplum/core';
import type { Appointment, Bundle, Coding, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { CodingDisplay, useMedplum, useMedplumProfile } from '@medplum/react';
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
import { IconChevronRight, IconX } from '@tabler/icons-react';
import classes from './SchedulePage.module.css';
import { useSchedulingStartsAt } from '../../hooks/useSchedulingStartsAt';
import { SchedulingTransientIdentifier } from '../../utils/scheduling';

type ScheduleFindPaneProps = {
  schedule: WithId<Schedule>;
  range: Range;
  onChange: (slots: Slot[]) => void;
  onSelectSlot: (slot: Slot) => void;
  slots: Slot[] | undefined;
};

const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';

function parseSchedulingParameters(schedule: Schedule): (Coding | undefined)[] {
  const extensions = schedule?.extension?.filter((ext) => ext.url === SchedulingParametersURI) ?? [];
  const serviceTypes = extensions.map((ext) => getExtensionValue(ext, 'serviceType') as Coding | undefined);
  return serviceTypes;
}

// Allows selection of a ServiceType found in the schedule's
// SchedulingParameters extensions, and runs a `$find` operation to look for
// upcoming slots that can be used to book an Appointment of that type.
//
// See https://www.medplum.com/docs/scheduling/defining-availability for details.
export function ScheduleFindPane(props: ScheduleFindPaneProps): JSX.Element {
  const { schedule, onChange, range } = props;
  const serviceTypes = useMemo(() => parseSchedulingParameters(schedule), [schedule]);

  const medplum = useMedplum();

  // null: no selection made
  // undefined: "wildcard" availability selected
  // Coding: a specific service type was selected
  const [serviceType, setServiceType] = useState<Coding | undefined | null>(
    // If there is exactly one option, select it immediately instead of forcing user
    // to select it
    serviceTypes.length === 1 ? serviceTypes[0] : null
  );

  // Ensure that we are searching for slots in the future by at least 30 minutes.
  const earliestSchedulable = useSchedulingStartsAt({ minimumNoticeMinutes: 30 });
  const searchStart = range.start < earliestSchedulable ? earliestSchedulable : range.start;
  const searchEnd = searchStart < range.end ? range.end : new Date(searchStart.getTime() + 1000 * 60 * 60 * 24 * 7);

  const start = searchStart.toISOString();
  const end = searchEnd.toISOString();

  useEffect(() => {
    if (!schedule || serviceType === null) {
      return () => {};
    }
    const controller = new AbortController();
    const signal = controller.signal;
    const params = new URLSearchParams({ start, end });
    if (serviceType) {
      params.append('service-type', `${serviceType.system}|${serviceType.code}`);
    }
    medplum
      .get<Bundle<Slot>>(`fhir/R4/Schedule/${schedule.id}/$find?${params}`, { signal })
      .then((bundle) => {
        if (!signal.aborted) {
          if (bundle.entry) {
            bundle.entry.forEach((entry) => entry.resource && SchedulingTransientIdentifier.set(entry.resource));
            onChange(bundle.entry.map((entry) => entry.resource).filter(isDefined));
          } else {
            onChange([]);
          }
        }
      })
      .catch((error) => {
        if (!signal.aborted) {
          showErrorNotification(error);
        }
      });
    return () => {
      controller.abort();
    };
  }, [medplum, schedule, serviceType, start, end, onChange]);

  const handleDismiss = useCallback(() => {
    setServiceType(null);
    onChange([]);
  }, [onChange]);

  if (serviceType !== null) {
    return (
      <Stack gap="sm" justify="flex-start">
        <Title order={4}>
          <Group justify="space-between">
            <span>{serviceType ? <CodingDisplay value={serviceType} /> : 'Event'}</span>
            {serviceTypes.length > 1 && (
              <Button variant="subtle" onClick={handleDismiss} aria-label="Clear selection">
                <IconX size={20} />
              </Button>
            )}
          </Group>
        </Title>
        {(props.slots ?? EMPTY).map((slot) => (
          <Button
            key={SchedulingTransientIdentifier.get(slot)}
            variant="outline"
            color="gray.3"
            styles={(theme) => ({ label: { fontWeight: 'normal', color: theme.colors.gray[9] } })}
            onClick={() => props.onSelectSlot(slot)}
          >
            {formatDateTime(slot.start)}
          </Button>
        ))}
      </Stack>
    );
  }

  return (
    <Stack gap="sm" justify="flex-start">
      <Title order={4}>Schedule&hellip;</Title>
      {serviceTypes.map((st, index) => (
        <Button
          key={st ? `${st.system}|${st.code}` : `wildcard-${index}`}
          fullWidth
          variant="outline"
          rightSection={<IconChevronRight size={12} />}
          justify="space-between"
          onClick={() => setServiceType(st)}
        >
          {st ? <CodingDisplay value={st} /> : 'Other'}
        </Button>
      ))}
    </Stack>
  );
}

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
  const [findSlots, setFindSlots] = useState<Slot[] | undefined>(undefined);

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

      // Remove the $find result we acted on from our state
      const id = SchedulingTransientIdentifier.get(slot);
      setFindSlots((slots) => (slots ?? EMPTY).filter((slot) => SchedulingTransientIdentifier.get(slot) !== id));

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

  const handleSelectSlot = useCallback(
    (slot: Slot) => {
      // If selecting a slot from "$find", run it through "$book" to create an
      // appointment and slots
      if (SchedulingTransientIdentifier.get(slot)) {
        bookSlot(slot).catch(showErrorNotification);
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
    [medplum, navigate]
  );

  const height = window.innerHeight - 60;
  const serviceTypes = useMemo(() => schedule && parseSchedulingParameters(schedule), [schedule]);

  return (
    <Box pos="relative" bg="white" p="md" style={{ height }}>
      <div className={classes.container}>
        <div className={classes.calendar}>
          <Calendar
            style={{ height: height - 150 }}
            onSelectInterval={handleSelectInterval}
            onSelectAppointment={handleSelectAppointment}
            onSelectSlot={handleSelectSlot}
            slots={[...(slots ?? []), ...(findSlots ?? [])]}
            appointments={appointments ?? []}
            onRangeChange={setRange}
          />
        </div>

        {serviceTypes?.length && schedule && range && (
          <div className={classes.findPane}>
            <ScheduleFindPane
              key={schedule.id}
              schedule={schedule}
              range={range}
              onChange={setFindSlots}
              onSelectSlot={(slot) => handleSelectSlot(slot)}
              slots={findSlots}
            />
          </div>
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
        {appointmentDetails && <AppointmentDetails appointment={appointmentDetails} />}
      </Drawer>
    </Box>
  );
}
