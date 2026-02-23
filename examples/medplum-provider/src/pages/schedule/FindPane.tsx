// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Stack, Title } from '@mantine/core';
import { EMPTY, isDefined, formatDateTime } from '@medplum/core';
import type { WithId } from '@medplum/core';
import type { Appointment, Bundle, CodeableConcept, Schedule, Slot } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, useMedplum } from '@medplum/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { showErrorNotification } from '../../utils/notifications';
import type { Range } from '../../types/scheduling';
import { IconChevronRight, IconX } from '@tabler/icons-react';
import { useSchedulingStartsAt } from '../../hooks/useSchedulingStartsAt';
import { serviceTypesFromSchedulingParameters, SchedulingTransientIdentifier } from '../../utils/scheduling';
import { BookAppointmentForm } from '../../components/schedule/BookAppointmentForm';

type FindPaneProps = {
  schedule: WithId<Schedule>;
  range: Range;
  onSuccess: (results: { appointments: Appointment[]; slots: Slot[] }) => void;
};

// Allows selection of a ServiceType found in the schedule's
// SchedulingParameters extensions, and runs a `$find` operation to look for
// upcoming slots that can be used to book an Appointment of that type.
//
// See https://www.medplum.com/docs/scheduling/defining-availability for details.
export function FindPane(props: FindPaneProps): JSX.Element {
  const [slots, setSlots] = useState<Slot[] | undefined>(undefined);
  const [chosenSlot, setChosenSlot] = useState<Slot | undefined>(undefined);
  const { schedule, range, onSuccess } = props;
  const serviceTypes = useMemo(
    () =>
      serviceTypesFromSchedulingParameters(schedule).map((codeableConcept) => ({
        codeableConcept,
        id: uuidv4(),
      })),
    [schedule]
  );

  const medplum = useMedplum();

  // null: no selection made
  // undefined: "wildcard" availability selected
  // Coding: a specific service type was selected
  const [serviceType, setServiceType] = useState<CodeableConcept | undefined | null>(
    // If there is exactly one option, select it immediately instead of forcing user
    // to select it
    serviceTypes.length === 1 ? serviceTypes[0].codeableConcept : null
  );

  // Ensure that we are searching for slots in the future by at least 30 minutes.
  const earliestSchedulable = useSchedulingStartsAt({ minimumNoticeMinutes: 30 });

  useEffect(() => {
    if (!schedule || serviceType === null) {
      return () => {};
    }

    // Compute search range
    const searchStart = range.start < earliestSchedulable ? earliestSchedulable : range.start;
    const searchEnd = searchStart < range.end ? range.end : new Date(searchStart.getTime() + 1000 * 60 * 60 * 24 * 7);
    const start = searchStart.toISOString();
    const end = searchEnd.toISOString();

    const controller = new AbortController();
    const signal = controller.signal;
    const params = new URLSearchParams({ start, end });
    if (serviceType) {
      serviceType.coding?.forEach((coding) => {
        params.append('service-type', `${coding.system}|${coding.code}`);
      });
    }
    medplum
      .get<Bundle<Slot>>(`fhir/R4/Schedule/${schedule.id}/$find?${params}`, { signal })
      .then((bundle) => {
        if (!signal.aborted) {
          if (bundle.entry) {
            bundle.entry.forEach((entry) => entry.resource && SchedulingTransientIdentifier.set(entry.resource));
            setSlots(bundle.entry.map((entry) => entry.resource).filter(isDefined));
          } else {
            setSlots([]);
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
  }, [medplum, schedule, serviceType, range, earliestSchedulable]);

  const handleDismiss = useCallback(() => {
    setServiceType(null);
    setSlots([]);
  }, []);

  const handleBookSuccess = useCallback(
    (results: { appointments: Appointment[]; slots: Slot[] }) => {
      setServiceType(null);
      setSlots([]);
      setChosenSlot(undefined);
      onSuccess(results);
    },
    [onSuccess]
  );

  if (chosenSlot) {
    return (
      <Stack gap="sm" justify="flex-start">
        <Title order={4}>
          <Group justify="space-between">
            <span>{serviceType ? <CodeableConceptDisplay value={serviceType} /> : 'Event'}</span>
            <Button variant="subtle" onClick={() => setChosenSlot(undefined)} aria-label="Clear selection">
              <IconX size={20} />
            </Button>
          </Group>
        </Title>
        <BookAppointmentForm slot={chosenSlot} onSuccess={handleBookSuccess} />
      </Stack>
    );
  }

  // tricky: `undefined` means the "wildcard" service type, so we explicitly
  // test against `null` here.
  if (serviceType !== null) {
    return (
      <Stack gap="sm" justify="flex-start">
        <Title order={4}>
          <Group justify="space-between">
            <span>{serviceType ? <CodeableConceptDisplay value={serviceType} /> : 'Event'}</span>
            {serviceTypes.length > 1 && (
              <Button variant="subtle" onClick={handleDismiss} aria-label="Clear selection">
                <IconX size={20} />
              </Button>
            )}
          </Group>
        </Title>
        {(slots ?? EMPTY).map((slot) => (
          <Button
            key={SchedulingTransientIdentifier.get(slot)}
            variant="outline"
            color="gray.3"
            styles={(theme) => ({ label: { fontWeight: 'normal', color: theme.colors.gray[9] } })}
            onClick={() => setChosenSlot(slot)}
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
      {serviceTypes.map((st) => (
        <Button
          key={st.id}
          fullWidth
          variant="outline"
          rightSection={<IconChevronRight size={12} />}
          justify="space-between"
          onClick={() => setServiceType(st.codeableConcept)}
        >
          {st.codeableConcept ? <CodeableConceptDisplay value={st.codeableConcept} /> : 'Other'}
        </Button>
      ))}
    </Stack>
  );
}
