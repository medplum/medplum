// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { AppointmentServiceMultiSelect } from '../AppointmentFinder/AppointmentServiceSelect';
import { isServiceKeptAtAnyLocation } from '../AppointmentFinder/AppointmentServiceSelect.utils';
import { BOOKABLE_SERVICE_FACILITY_SEARCH_CRITERIA } from '../constants';
import { ServiceFacilitiesInput } from '../ServiceFacilityInput';

const NONE: readonly WithId<HealthcareService>[] = [];
const NO_SITES: NonNullable<CalendarFilterValues['serviceFacilities']> = [];

/**
 * The chosen filter values, used to constrain visible Schedules and Appointments.
 */
export interface CalendarFilterValues {
  /**
   * The chosen sites, any of which will do. Absent or empty for every site. A reference only when
   * it is a site the filters started on.
   */
  readonly serviceFacilities?: readonly (WithId<Location> | (Reference<Location> & { reference: string }))[];
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
 * Several sites and several visit types can be chosen, and any one of each will do.
 *
 * The filters are not peers. The sites decide which visit types are available,
 * so a change of sites drops each chosen visit type none of them holds — the same rule `AppointmentProposalForm` applies when its site
 * changes. A visit type never changes the sites on offer.
 *
 * @param props - Component props
 * @returns A React Node with the Service Facility and Visit Type fields in it
 */
export function CalendarFilters(props: CalendarFiltersProps): JSX.Element {
  const { defaultValue, onChange } = props;
  const [serviceFacilities, setServiceFacilities] = useState<NonNullable<CalendarFilterValues['serviceFacilities']>>(
    defaultValue?.serviceFacilities ?? NO_SITES
  );
  const [services, setServices] = useState<readonly WithId<HealthcareService>[]>(defaultValue?.services ?? NONE);

  // Key to remount field relying on `defaultValue` on change
  // see: https://github.com/medplum/medplum/issues/10288
  const [serviceFieldKey, setServiceFieldKey] = useState(0);

  const selectServiceFacilities = useCallback(
    (next: WithId<Location>[]): void => {
      setServiceFacilities(next);
      // Drop the chosen visit types that are not available at any of the service facilities now chosen
      const kept = services.filter((service) => isServiceKeptAtAnyLocation(service, next));
      if (kept.length !== services.length) {
        setServices(kept);
        setServiceFieldKey((key) => key + 1);
      }
      onChange({ serviceFacilities: next, services: kept });
    },
    [onChange, services]
  );

  const selectServices = useCallback(
    (next: WithId<HealthcareService>[]): void => {
      setServices(next);
      onChange({ serviceFacilities, services: next });
    },
    [serviceFacilities, onChange]
  );

  return (
    <Stack gap="xs">
      <ServiceFacilitiesInput
        label="Service Facility"
        placeholder={serviceFacilities.length > 0 ? 'Add a service facility' : 'All service facilities'}
        searchCriteria={BOOKABLE_SERVICE_FACILITY_SEARCH_CRITERIA}
        defaultValue={serviceFacilities}
        onChange={selectServiceFacilities}
      />
      <AppointmentServiceMultiSelect
        key={serviceFieldKey}
        label="Visit Type"
        placeholder={services.length > 0 ? 'Add a visit type' : 'All visit types'}
        serviceFacilities={serviceFacilities}
        defaultValue={services}
        onChange={selectServices}
      />
    </Stack>
  );
}
