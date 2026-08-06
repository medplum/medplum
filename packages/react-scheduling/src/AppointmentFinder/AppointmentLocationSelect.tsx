// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getDisplayString } from '@medplum/core';
import type { Location } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useMemo } from 'react';
import type { AppointmentPickListItem } from './AppointmentPickList';
import { AppointmentPickList } from './AppointmentPickList';
import { usePickListSearch } from './usePickListSearch';

/**
 * How many sites are offered. High enough to be every site a practice has, since
 * with no search field anything past the end of the list cannot be reached.
 */
const LOCATION_COUNT = 100;

export interface AppointmentLocationSelectProps {
  readonly location: WithId<Location> | undefined;
  readonly onChange: (location: WithId<Location> | undefined) => void;
  readonly label?: string;
  readonly disabled?: boolean;
}

/**
 * Chooses the site an appointment is at.
 *
 * Every site is listed at once, with no search: a practice has a handful of
 * them, and they are read down faster than a field can be typed into.
 *
 * Kept apart from the service field so either can be answered on its own: an
 * app that already knows the site can drop this and keep the service picker, and
 * one that asks about the site first can narrow the services with the answer.
 *
 * @param props - The React props.
 * @returns The location list.
 */
export function AppointmentLocationSelect(props: AppointmentLocationSelectProps): JSX.Element {
  const { location, onChange, label = 'Location', disabled } = props;
  const medplum = useMedplum();

  const loadLocations = useCallback(
    async (_query: string, signal: AbortSignal): Promise<WithId<Location>[]> => {
      const searchParams = new URLSearchParams({ _count: LOCATION_COUNT.toString() });
      const locations = await medplum.searchResources('Location', searchParams, { signal });
      return [...locations].sort((left, right) => getDisplayString(left).localeCompare(getDisplayString(right)));
    },
    [medplum]
  );

  const { items, loading, error } = usePickListSearch(loadLocations);

  // A site that has been chosen stays on the list even if it is not among the
  // ones loaded, so that what is chosen is always visible.
  const rows = useMemo(() => withSelected(items, location), [items, location]);

  return (
    <AppointmentPickList
      label={label}
      required
      disabled={disabled}
      loading={loading}
      error={error}
      items={rows.map(toItem)}
      selectedId={location?.id}
      emptyMessage="No sites found."
      onSelect={(id) => onChange(rows.find((row) => row.id === id))}
    />
  );
}

function withSelected(
  items: readonly WithId<Location>[],
  selected: WithId<Location> | undefined
): readonly WithId<Location>[] {
  if (!selected || items.some((item) => item.id === selected.id)) {
    return items;
  }
  return [selected, ...items];
}

function toItem(location: WithId<Location>): AppointmentPickListItem {
  return {
    id: location.id,
    label: getDisplayString(location),
    description: formatAddress(location),
  };
}

/**
 * Says where a site is, for telling two of the same name apart.
 * @param location - The site to describe.
 * @returns The town and state, or undefined when neither is recorded.
 */
function formatAddress(location: Location): string | undefined {
  const parts = [location.address?.city, location.address?.state].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}
