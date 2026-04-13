// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Stack, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { EMPTY, formatDateTime, isDefined } from '@medplum/core';
import type { Appointment, Bundle, HealthcareService, Schedule, Slot } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, useMedplum, useSearchResources } from '@medplum/react';
import { IconChevronRight, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookAppointmentForm } from '../../components/schedule/BookAppointmentForm';
import { useSchedulingStartsAt } from '../../hooks/useSchedulingStartsAt';
import type { Range } from '../../types/scheduling';
import { showErrorNotification } from '../../utils/notifications';
import { hasSchedulingParameters, SchedulingTransientIdentifier } from '../../utils/scheduling';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type FindPaneProps = {
  schedule: WithId<Schedule>;
  range: Range;
  onSuccess: (results: { appointments: Appointment[]; slots: Slot[] }) => void;
  className?: string;
};

function HealthcareServiceDisplay(props: { value: HealthcareService }): JSX.Element {
  const service = props.value;

  if (service.name) {
    return <>{service.name}</>;
  }

  if (service.type) {
    return <CodeableConceptDisplay value={service.type[0]} />;
  }

  return <>(Unnamed HealthcareService)</>;
}

// Allows selection of a schedulable HealthcareService that matches
// `props.schedule.serviceType`. Uses $find to look for available appointment
// times. On selection, uses $book to create an appointment.
//
// See https://www.medplum.com/docs/scheduling/defining-availability for details.
export function FindPane(props: FindPaneProps): JSX.Element | null {
  const medplum = useMedplum();
  const [slots, setSlots] = useState<readonly Slot[] | undefined>(undefined);
  const [chosenSlot, setChosenSlot] = useState<Slot | undefined>(undefined);
  const [selectedHealthcareService, setSelectedHealthcareService] = useState<HealthcareService | undefined>();
  const { schedule, range, onSuccess } = props;

  const serviceTypeSearch = useMemo(() => {
    const tokenSet = new Set<string>();
    for (const concept of schedule.serviceType ?? EMPTY) {
      for (const coding of concept.coding ?? EMPTY) {
        tokenSet.add(`${coding.system ?? ''}|${coding.code ?? ''}`);
      }
    }
    return [...tokenSet].join(',');
  }, [schedule]);

  const [healthcareServices] = useSearchResources<'HealthcareService'>(
    'HealthcareService',
    `service-type=${serviceTypeSearch}`,
    { enabled: serviceTypeSearch !== '' }
  );

  const scheduleableServices = useMemo(
    () => healthcareServices?.filter((service) => hasSchedulingParameters(service)),
    [healthcareServices]
  );

  useEffect(() => {
    // If there is exactly one option, select it immediately instead of forcing user
    // to select it
    if (scheduleableServices?.length === 1) {
      setSelectedHealthcareService(scheduleableServices[0]);
    }
  }, [scheduleableServices]);

  // Ensure that we are searching for slots in the future by at least 30 minutes.
  const earliestSchedulable = useSchedulingStartsAt({ minimumNoticeMinutes: 30 });

  useEffect(() => {
    if (!schedule || !selectedHealthcareService) {
      return () => {};
    }

    const serviceTypeParam = (selectedHealthcareService.type ?? EMPTY)
      .flatMap((concept) => (concept.coding ?? EMPTY).map((coding) => `${coding.system ?? ''}|${coding.code ?? ''}`))
      .join(',');

    // Compute search range
    const searchStart = range.start < earliestSchedulable ? earliestSchedulable : range.start;
    const searchEnd = searchStart < range.end ? range.end : new Date(searchStart.getTime() + ONE_WEEK_MS);
    const start = searchStart.toISOString();
    const end = searchEnd.toISOString();

    let completed = false;
    const controller = new AbortController();
    const signal = controller.signal;
    const params = new URLSearchParams({
      start,
      end,
      'service-type': serviceTypeParam,
    });

    medplum
      .get<Bundle<Slot>>(`fhir/R4/Schedule/${schedule.id}/$find?${params}`, { signal })
      .then(
        (bundle) => {
          if (signal.aborted) {
            return;
          }
          if (bundle.entry) {
            bundle.entry.forEach((entry) => entry.resource && SchedulingTransientIdentifier.set(entry.resource));
            setSlots(bundle.entry.map((entry) => entry.resource).filter(isDefined));
          } else {
            setSlots([]);
          }
        },
        (error) => {
          if (!signal.aborted) {
            showErrorNotification(error);
          }
        }
      )
      .finally(() => {
        completed = true;
      });
    return () => {
      if (!completed) {
        controller.abort();
      }
    };
  }, [medplum, schedule, selectedHealthcareService, range, earliestSchedulable]);

  const handleDismiss = useCallback(() => {
    setSelectedHealthcareService(undefined);
    setSlots(EMPTY);
  }, []);

  const handleBookSuccess = useCallback(
    (results: { appointments: Appointment[]; slots: Slot[] }) => {
      setSelectedHealthcareService(undefined);
      setSlots([]);
      setChosenSlot(undefined);
      onSuccess(results);
    },
    [onSuccess]
  );

  if (!scheduleableServices?.length) {
    return null;
  }

  if (selectedHealthcareService && chosenSlot) {
    return (
      <Stack gap="sm" justify="flex-start" className={props.className}>
        <Title order={4}>
          <Group justify="space-between">
            <HealthcareServiceDisplay value={selectedHealthcareService} />
            <Button variant="subtle" onClick={() => setChosenSlot(undefined)} aria-label="Clear selection">
              <IconX size={20} />
            </Button>
          </Group>
        </Title>
        <BookAppointmentForm slot={chosenSlot} onSuccess={handleBookSuccess} />
      </Stack>
    );
  }

  if (selectedHealthcareService) {
    return (
      <Stack gap="sm" justify="flex-start" className={props.className}>
        <Title order={4}>
          <Group justify="space-between">
            <HealthcareServiceDisplay value={selectedHealthcareService} />
            {scheduleableServices.length > 1 && (
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
    <Stack gap="sm" justify="flex-start" className={props.className}>
      <Title order={4}>Schedule&hellip;</Title>
      {scheduleableServices.map((service) => (
        <Button
          key={service.id}
          fullWidth
          variant="outline"
          rightSection={<IconChevronRight size={12} />}
          justify="space-between"
          onClick={() => setSelectedHealthcareService(service)}
        >
          <HealthcareServiceDisplay value={service} />
        </Button>
      ))}
    </Stack>
  );
}
