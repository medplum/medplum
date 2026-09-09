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

const SERVICE_PAGE_SIZE = 25;

/**
 * `_sort=name` stays on both requests even though the field orders the merge itself:
 * it makes each response its own first page by name, and the true first page is
 * contained in the union of the two.
 */
const SERVICE_SEARCH_CRITERIA = { _count: String(SERVICE_PAGE_SIZE), _sort: 'name' };

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
 * A chosen site narrows the list to the visit types it can hold: the ones naming
 * that site, and the ones naming no location at all.
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
      const criteria = new URLSearchParams(SERVICE_SEARCH_CRITERIA);
      if (input) {
        criteria.set('name', input);
      }
      // A reference search needs the element present, so what names no location cannot
      // ride on the site's own search and the field asks twice, together. With no site
      // it asks once: `location:missing=true` alone would hide every sited visit type.
      const searches = locationReference
        ? [withParam(criteria, 'location', locationReference), withParam(criteria, 'location:missing', 'true')]
        : [criteria];
      const pages = await Promise.all(
        searches.map(async (params) => medplum.searchResources('HealthcareService', params, { signal }))
      );
      // The scheduling filter is applied here rather than in the search because it
      // reads an extension, which no search parameter covers.
      const services = pages.flatMap((page) => page.filter(hasSchedulingParameters));
      // Disjoint by construction — one needs `location` present, the other needs it
      // absent — so the merge is a sort with nothing to deduplicate, and where a visit
      // type was found never shows in the order.
      services.sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''));
      return services.slice(0, SERVICE_PAGE_SIZE);
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
        locationResource
          ? `Showing visit types offered at ${getDisplayString(locationResource)}, plus those not tied to a site.`
          : undefined
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

function withParam(criteria: URLSearchParams, name: string, value: string): URLSearchParams {
  const params = new URLSearchParams(criteria);
  params.set(name, value);
  return params;
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
