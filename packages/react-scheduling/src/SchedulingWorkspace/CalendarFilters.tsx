// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService, Location } from '@medplum/fhirtypes';
import { ResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { AppointmentServiceSelect } from '../AppointmentFinder/AppointmentServiceSelect';
import { isServiceKeptAtLocation } from '../AppointmentFinder/AppointmentServiceSelect.utils';
import { LOCATION_SEARCH_CRITERIA } from '../constants';

/**
 * What the two filters currently narrow calendars to, for `searchScheduleCandidates`.
 *
 * Each field searches the server for its own options, so what is held here is the
 * resource itself rather than an id: a typeahead's list is whatever was last searched
 * for, which is no place to look a choice up. Both keep their identity for as long as
 * the choice stands, so a caller can key an effect on them.
 */
export interface CalendarFilterValues {
  /** The chosen site, or absent for every site. */
  readonly location?: WithId<Location>;
  /** The chosen visit type, or absent for every visit type. */
  readonly service?: WithId<HealthcareService>;
}

export interface CalendarFiltersProps {
  /** Reports both filters, whichever one changed. */
  readonly onChange: (values: CalendarFilterValues) => void;
}

/**
 * Fields narrowing which calendars are visible
 *
 * Typeaheads rather than lists: a tenant might have dozens of sites or visit
 * types. The same pickers the booking form uses, so a visit type is searched
 * for the same way wherever it is chosen.
 *
 * The filters are not peers. A site decides which visit types are available
 * there, so choosing a site drops a chosen visit type the new site does not
 * hold — the same rule `AppointmentProposalForm` applies when its site
 * changes. A visit type never changes the sites on offer.
 *
 * @param props - Component props
 * @returns A React Node with the Location and Visit Type fields in it
 */
export function CalendarFilters(props: CalendarFiltersProps): JSX.Element {
  const { onChange } = props;
  const [location, setLocation] = useState<WithId<Location>>();
  const [service, setService] = useState<WithId<HealthcareService>>();

  // Key to remount field relying on `defaultValue` on change
  // see: https://github.com/medplum/medplum/issues/10288
  const [serviceFieldKey, setServiceFieldKey] = useState(0);

  const selectLocation = useCallback(
    (next: WithId<Location> | undefined): void => {
      setLocation(next);
      // Clear a service selection if it is not available at the newly selected location
      const kept = service && isServiceKeptAtLocation(service, next) ? service : undefined;
      if (kept !== service) {
        setService(undefined);
        setServiceFieldKey((key) => key + 1);
      }
      onChange({ location: next, service: kept });
    },
    [onChange, service]
  );

  const selectService = useCallback(
    (next: WithId<HealthcareService> | undefined): void => {
      setService(next);
      onChange({ location, service: next });
    },
    [location, onChange]
  );

  return (
    <Stack gap="xs">
      <ResourceInput<WithId<Location>>
        resourceType="Location"
        name="location"
        label="Location"
        placeholder="All locations"
        searchCriteria={LOCATION_SEARCH_CRITERIA}
        defaultValue={location}
        onChange={selectLocation}
        clearable={false}
      />
      <AppointmentServiceSelect
        key={serviceFieldKey}
        label="Visit Type"
        placeholder="All visit types"
        required={false}
        location={location}
        defaultValue={service}
        onChange={selectService}
      />
    </Stack>
  );
}
