// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { AppointmentServiceMultiSelect } from '../AppointmentFinder/AppointmentServiceSelect';
import { isServiceKeptAtLocation } from '../AppointmentFinder/AppointmentServiceSelect.utils';
import { BOOKABLE_SERVICE_FACILITY_SEARCH_CRITERIA } from '../constants';
import { ServiceFacilityInput } from '../ServiceFacilityInput';

const NONE: readonly WithId<HealthcareService>[] = [];

/**
 * The chosen filter values, used to constrain visible Schedules and Appointments.
 */
export interface CalendarFilterValues {
  /**
   * The chosen site, or absent for every site. A reference only when it is the site the
   * filters started on and the user has not changed it.
   */
  readonly serviceFacility?: WithId<Location> | (Reference<Location> & { reference: string });
  /** The chosen visit types, any of which will do. Absent or empty for every visit type. */
  readonly services?: readonly WithId<HealthcareService>[];
}

export interface CalendarFiltersProps {
  /**
   * What the filters start on. Read once on mount, and not reported through
   * `onChange`: the caller already holds it.
   */
  readonly defaultValue?: CalendarFilterValues;
  /** Reports both filters, whichever one changed. */
  readonly onChange: (values: CalendarFilterValues) => void;
}

/**
 * Fields narrowing which calendars and appointments are visible
 *
 * Typeaheads rather than lists: a tenant might have dozens of sites or visit
 * types. The same pickers the booking form uses, so a visit type is searched
 * for the same way wherever it is chosen.
 *
 * Several visit types can be chosen, and any one of them will do.
 *
 * The filters are not peers. A site decides which visit types are available
 * there, so choosing a site drops each chosen visit type the new site does not
 * hold — the same rule `AppointmentProposalForm` applies when its site
 * changes. A visit type never changes the sites on offer.
 *
 * @param props - Component props
 * @returns A React Node with the Service Facility and Visit Type fields in it
 */
export function CalendarFilters(props: CalendarFiltersProps): JSX.Element {
  const { defaultValue, onChange } = props;
  const [serviceFacility, setServiceFacility] = useState<CalendarFilterValues['serviceFacility']>(
    defaultValue?.serviceFacility
  );
  const [services, setServices] = useState<readonly WithId<HealthcareService>[]>(defaultValue?.services ?? NONE);

  // Key to remount field relying on `defaultValue` on change
  // see: https://github.com/medplum/medplum/issues/10288
  const [serviceFieldKey, setServiceFieldKey] = useState(0);

  const selectServiceFacility = useCallback(
    (next: WithId<Location> | undefined): void => {
      setServiceFacility(next);
      // Drop the chosen visit types that are not available at the newly selected service facility
      const kept = services.filter((service) => isServiceKeptAtLocation(service, next));
      if (kept.length !== services.length) {
        setServices(kept);
        setServiceFieldKey((key) => key + 1);
      }
      onChange({ serviceFacility: next, services: kept });
    },
    [onChange, services]
  );

  const selectServices = useCallback(
    (next: WithId<HealthcareService>[]): void => {
      setServices(next);
      onChange({ serviceFacility, services: next });
    },
    [serviceFacility, onChange]
  );

  return (
    <Stack gap="xs">
      <ServiceFacilityInput
        label="Service Facility"
        placeholder="All service facilities"
        searchCriteria={BOOKABLE_SERVICE_FACILITY_SEARCH_CRITERIA}
        defaultValue={serviceFacility}
        onChange={selectServiceFacility}
      />
      <AppointmentServiceMultiSelect
        key={serviceFieldKey}
        label="Visit Type"
        placeholder={services.length > 0 ? 'Add a visit type' : 'All visit types'}
        serviceFacility={serviceFacility}
        defaultValue={services}
        onChange={selectServices}
      />
    </Stack>
  );
}
