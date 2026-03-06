// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Loader } from '@mantine/core';
import type { Appointment, Bundle, Patient, Slot } from '@medplum/fhirtypes';
import { createReference, isDefined } from '@medplum/core';
import { Document, Scheduler, useMedplum } from '@medplum/react';
import type { SlotSearchFunction } from '@medplum/react';
import { useSearchOne } from '@medplum/react-hooks';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';

export function GetCare(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [schedule, loading] = useSearchOne('Schedule');

  const fetchSlots: SlotSearchFunction = async (period) => {
    if (!schedule) {
      return [];
    }

    // $find op requires `start` and `end` times are defined
    if (!period.start || !period.end) {
      return [];
    }

    const params = new URLSearchParams({ start: period.start, end: period.end });
    const findUrl = medplum.fhirUrl('Schedule', schedule.id, '$find');
    const bundle = await medplum.get<Bundle<Slot>>(`${findUrl}?${params}`);
    return bundle.entry?.map((entry) => entry.resource).filter(isDefined) ?? [];
  };

  const bookSlot = async (slot: Slot): Promise<void> => {
    await medplum.post<Bundle<Appointment | Slot>>(medplum.fhirUrl('Appointment', '$book'), {
      resourceType: 'Parameters',
      parameter: [
        { name: 'slot', resource: slot },
        { name: 'patient-reference', valueReference: createReference(patient) },
      ],
    });
  };

  if (loading) {
    return (
      <Document width={800}>
        <Loader />
      </Document>
    );
  }

  if (!schedule) {
    return (
      <Document width={800}>
        <Alert variant="outline" color="red" title="Schedule unavailable" icon={<IconInfoCircle />}>
          Loading the schedule failed.
        </Alert>
      </Document>
    );
  }

  return (
    <Document width={800}>
      <Scheduler schedule={schedule} fetchSlots={fetchSlots} onSelectSlot={bookSlot} />
    </Document>
  );
}
