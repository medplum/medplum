// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getDisplayString, isOk, normalizeErrorString } from '@medplum/core';
import type { Location } from '@medplum/fhirtypes';
import { useSearchResources } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useMemo } from 'react';
import type { AppointmentPickListItem } from './AppointmentPickList';
import { AppointmentPickList } from './AppointmentPickList';

/**
 * How many sites are offered. High enough to be every site a practice has, since
 * with no search field anything past the end of the list cannot be reached.
 */
const LOCATION_COUNT = 100;

/**
 * Every site at once, named in order. Sorting is the server's, so the order holds
 * across the whole set rather than only the page that came back.
 */
const LOCATION_QUERY = { _count: LOCATION_COUNT, _sort: 'name' };

export interface AppointmentLocationSelectProps {
  readonly location: WithId<Location> | undefined;
  readonly onChange: (location: WithId<Location> | undefined) => void;
  readonly label?: string;
  readonly disabled?: boolean;
}

/**
 * Chooses the site an appointment is at.
 * @param props - The React props.
 * @returns The location list.
 */
export function AppointmentLocationSelect(props: AppointmentLocationSelectProps): JSX.Element {
  const { location, onChange, label = 'Location', disabled } = props;
  const [locations, loading, outcome] = useSearchResources('Location', LOCATION_QUERY);

  // A site that has been chosen stays on the list even if it is not among the
  // ones loaded, so that what is chosen is always visible.
  const rows = useMemo(() => withSelected(locations ?? [], location), [locations, location]);

  return (
    <AppointmentPickList
      label={label}
      required
      disabled={disabled}
      loading={loading || locations === undefined}
      error={outcome && !isOk(outcome) ? normalizeErrorString(outcome) : undefined}
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
