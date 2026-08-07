// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getDisplayString, getReferenceString, hasSchedulingParameters } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useMemo } from 'react';
import { getConfiguredDurationMinutes } from './AppointmentFinder.params';
import type { AppointmentPickListItem } from './AppointmentPickList';
import { AppointmentPickList } from './AppointmentPickList';
import { usePickListSearch } from './usePickListSearch';

/** How many visit types are offered at once. */
const SERVICE_COUNT = 25;

export interface AppointmentServiceSelectProps {
  readonly service: WithId<HealthcareService> | undefined;
  readonly onChange: (service: WithId<HealthcareService> | undefined) => void;
  /** A chosen site, which narrows the services on offer to the ones held there. */
  readonly location?: WithId<Location>;
  readonly label?: string;
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
 * @returns The service list.
 */
export function AppointmentServiceSelect(props: AppointmentServiceSelectProps): JSX.Element {
  const { location, service, onChange, label = 'Service type', disabled } = props;
  const medplum = useMedplum();

  const locationReference = location && getReferenceString(location);

  const loadServices = useCallback(
    async (query: string, signal: AbortSignal): Promise<WithId<HealthcareService>[]> => {
      const searchParams = new URLSearchParams({ _count: SERVICE_COUNT.toString() });
      if (query) {
        searchParams.set('name', query);
      }
      if (locationReference) {
        searchParams.set('location', locationReference);
      }
      const services = await medplum.searchResources('HealthcareService', searchParams, { signal });
      return services
        .filter(hasSchedulingParameters)
        .sort((left, right) => getDisplayString(left).localeCompare(getDisplayString(right)));
    },
    [medplum, locationReference]
  );

  const { items, loading, error, query, setQuery } = usePickListSearch(loadServices);

  const rows = useMemo(() => withSelected(items, service), [items, service]);

  return (
    <AppointmentPickList
      label={label}
      required
      disabled={disabled}
      loading={loading}
      error={error}
      query={query}
      onQueryChange={setQuery}
      items={rows.map(toItem)}
      selectedId={service?.id}
      emptyMessage={query ? 'No visit types match this search.' : 'No schedulable visit types found.'}
      footnote={location ? `Showing visit types offered at ${getDisplayString(location)}.` : undefined}
      onSelect={(id) => onChange(rows.find((row) => row.id === id))}
    />
  );
}

function withSelected(
  items: readonly WithId<HealthcareService>[],
  selected: WithId<HealthcareService> | undefined
): readonly WithId<HealthcareService>[] {
  if (!selected || items.some((item) => item.id === selected.id)) {
    return items;
  }
  return [selected, ...items];
}

function toItem(service: WithId<HealthcareService>): AppointmentPickListItem {
  return {
    id: service.id,
    label: getDisplayString(service),
    description: formatServiceDetail(service),
  };
}

/**
 * Describes a visit type by what it is and how long it takes.
 *
 * The length is worth saying up front: it is the difference between two visit
 * types that otherwise read the same, and it decides what the search can offer.
 *
 * @param service - The service to describe.
 * @returns A short description, or undefined when the service says nothing useful.
 */
function formatServiceDetail(service: WithId<HealthcareService>): string | undefined {
  const category = service.type?.[0]?.text ?? service.type?.[0]?.coding?.[0]?.display;
  const duration = getConfiguredDurationMinutes(service);
  const parts = [category, duration ? `${duration} min` : undefined].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * Narrows a service selection to the reference `$find` needs.
 * @param service - The chosen service.
 * @returns A reference to the service.
 */
export function toServiceReference(service: WithId<HealthcareService>): Reference<HealthcareService> {
  return { reference: getReferenceString(service), display: getDisplayString(service) };
}
