// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Loader } from '@mantine/core';
import type { Appointment, Bundle, HealthcareService, Patient, Reference, Slot } from '@medplum/fhirtypes';
import { createReference, getExtensionValue, isDefined, normalizeErrorString } from '@medplum/core';
import { Document, Scheduler, useMedplum } from '@medplum/react';
import type { SlotSearchFunction } from '@medplum/react';
import { useSearchOne } from '@medplum/react-hooks';
import { IconInfoCircle } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';

const SERVICE_TYPE_REFERENCE_URI = 'https://medplum.com/fhir/service-type-reference';

export function GetCare(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [schedule, loading] = useSearchOne('Schedule');

  const healthcareServiceRef = schedule?.serviceType
    ?.map(
      (concept) => getExtensionValue(concept, SERVICE_TYPE_REFERENCE_URI) as Reference<HealthcareService> | undefined
    )
    .find(isDefined);

  const fetchSlots: SlotSearchFunction = async (period) => {
    if (!schedule || !healthcareServiceRef?.reference) {
      return [];
    }

    // $find op requires `start` and `end` times are defined
    if (!period.start || !period.end) {
      return [];
    }

    const params = new URLSearchParams({
      start: period.start,
      end: period.end,
      'service-type-reference': healthcareServiceRef.reference,
    });
    const findUrl = medplum.fhirUrl('Schedule', schedule.id, '$find');
    const bundle = await medplum.get<Bundle<Slot>>(`${findUrl}?${params}`);
    return bundle.entry?.map((entry) => entry.resource).filter(isDefined) ?? [];
  };

  const [bookSuccess, setBookSuccess] = useState(false);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<unknown>();

  const bookSlot = async (slot: Slot): Promise<void> => {
    setBookLoading(true);
    await medplum
      .post<Bundle<Appointment | Slot>>(medplum.fhirUrl('Appointment', '$book'), {
        resourceType: 'Parameters',
        parameter: [
          { name: 'slot', resource: slot },
          { name: 'patient-reference', valueReference: createReference(patient) },
        ],
      })
      .then(
        () => setBookSuccess(true),
        (err) => setBookError(err)
      )
      .finally(() => setBookLoading(false));
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

  if (!healthcareServiceRef) {
    return (
      <Document width={800}>
        <Alert variant="outline" color="red" title="Schedule unavailable" icon={<IconInfoCircle />}>
          No appointment type is configured for this schedule.
        </Alert>
      </Document>
    );
  }

  return (
    <Document width={800}>
      <Scheduler schedule={schedule} fetchSlots={fetchSlots} onSelectSlot={bookSlot}>
        {bookLoading && <Loader />}
        {!!bookError && (
          <Alert variant="outline" color="red" title="Booking failed" icon={<IconInfoCircle />}>
            {normalizeErrorString(bookError)}
          </Alert>
        )}
        {bookSuccess && (
          <div>
            <h3>You're all set!</h3>
            <p>Your appointment has been created.</p>
          </div>
        )}
      </Scheduler>
    </Document>
  );
}
