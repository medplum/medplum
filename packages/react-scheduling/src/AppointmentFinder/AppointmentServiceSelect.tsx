// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { formatCodeableConcept, getDisplayString, getReferenceString, hasSchedulingParameters } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { AsyncAutocomplete } from '@medplum/react';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback } from 'react';
import { AppointmentOptionRow } from './AppointmentOptionRow';
import { getServiceDurationMinutes } from './AppointmentServiceSelect.utils';

/**
 * How many visit types one search offers, and the order they come back in.
 */
const SERVICE_SEARCH_CRITERIA = { _count: '25', _sort: 'name' };

export interface AppointmentServiceSelectProps {
  readonly defaultValue?: WithId<HealthcareService>;
  readonly onChange: (service: WithId<HealthcareService> | undefined) => void;
  /** A chosen site, which narrows the services on offer to the ones held there. */
  readonly location?: WithId<Location> | Reference<Location>;
  readonly label?: string;
  readonly error?: string;
  readonly disabled?: boolean;
}

/**
 * Chooses the service an appointment is for.
 *
 * Only services configured for scheduling are offered. A `HealthcareService`
 * without a `SchedulingParameters` extension has no duration or alignment for
 * `$find` to work from, so booking against it cannot succeed.
 *
 * @param props - The React props.
 * @returns The service field.
 */
export function AppointmentServiceSelect(props: AppointmentServiceSelectProps): JSX.Element {
  const { location, defaultValue, onChange, label = 'Visit type', error, disabled } = props;
  const medplum = useMedplum();

  const locationReference = location && getReferenceString(location);
  const locationResource = useResource(location);

  const loadOptions = useCallback(
    async (input: string, signal: AbortSignal): Promise<WithId<HealthcareService>[]> => {
      const searchParams = new URLSearchParams(SERVICE_SEARCH_CRITERIA);
      if (input) {
        searchParams.set('name', input);
      }
      if (locationReference) {
        searchParams.set('location', locationReference);
      }
      const services = await medplum.searchResources('HealthcareService', searchParams, { signal });
      // The scheduling filter is applied here rather than in the search because it
      // reads an extension, which no search parameter covers.
      return services.filter(hasSchedulingParameters);
    },
    [medplum, locationReference]
  );

  const handleChange = useCallback((services: WithId<HealthcareService>[]) => onChange(services[0]), [onChange]);

  return (
    <AsyncAutocomplete<WithId<HealthcareService>>
      name="service"
      label={label}
      placeholder="Search visit types"
      description={
        locationResource ? `Showing visit types offered at ${getDisplayString(locationResource)}.` : undefined
      }
      required
      maxValues={1}
      error={error}
      disabled={disabled}
      defaultValue={defaultValue}
      toOption={toOption}
      loadOptions={loadOptions}
      itemComponent={ServiceItem}
      onChange={handleChange}
    />
  );
}

function toOption(service: WithId<HealthcareService>): AsyncAutocompleteOption<WithId<HealthcareService>> {
  return { value: service.id, label: getDisplayString(service), resource: service };
}

/**
 * One visit type on the list, described by what it is and how long it takes.
 * @param props - The option to render.
 * @returns The row.
 */
function ServiceItem(props: Readonly<AsyncAutocompleteOption<WithId<HealthcareService>>>): JSX.Element {
  return <AppointmentOptionRow label={props.label} detail={formatServiceDetail(props.resource)} />;
}

function formatServiceDetail(service: WithId<HealthcareService>): string | undefined {
  const category = formatCodeableConcept(service.type?.[0]);
  const duration = getServiceDurationMinutes(service);
  const parts = [category, duration !== undefined ? `${duration} min` : undefined].filter(Boolean);
  return parts.join(' · ') || undefined;
}
