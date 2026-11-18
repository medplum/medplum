// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Checkbox, Divider, Stack } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { AppointmentServiceMultiSelect } from '../AppointmentFinder/AppointmentServiceSelect';
import { isServiceKeptAtAnyLocation } from '../AppointmentFinder/AppointmentServiceSelect.utils';
import { BOOKABLE_SERVICE_FACILITY_SEARCH_CRITERIA } from '../constants';
import { ServiceFacilitiesInput } from '../ServiceFacilityInput';
import { keepServicesAtSites } from './CalendarFilters.utils';
import { PanelSection } from './CalendarsPanel/PanelSection';

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
  /**
   * The visit types to include, any of which will do. Absent for every visit type. Empty for none of
   * them, which hides every appointment. They narrow the appointments drawn and never the calendars.
   */
  readonly services?: readonly WithId<HealthcareService>[];
  /**
   * Not a filter: the visit types whose availability is shaded on the calendar, three at most. Absent
   * or empty for none, where the filters' empty is all.
   */
  readonly availabilityServices?: readonly WithId<HealthcareService>[];
}

/** How many visit types' availability can be shaded at once, each in a lane of the day's column. */
const MAX_AVAILABILITY_SERVICES = 3;

export interface CalendarFiltersProps {
  /**
   * What the filters start on. Read once on mount, and not reported through
   * `onChange`: the caller already holds it.
   */
  readonly defaultValue?: CalendarFilterValues;
  /** Reports every field, whichever one changed. */
  readonly onChange: (values: CalendarFilterValues) => void;
}

/**
 * Fields narrowing which calendars and appointments are visible: the sites both, and the visit types
 * the appointments only
 *
 * Typeaheads rather than lists: a tenant might have dozens of sites or visit
 * types. The same pickers the booking form uses, so a visit type is searched
 * for the same way wherever it is chosen.
 *
 * Several sites and several visit types can be chosen, and any one of each will do.
 *
 * The visit types are a list of the ones to include, with an "All visit types" checkbox, ticked to start
 * with, standing for every one of them. Choosing a visit type unticks it. Unticked with nothing chosen,
 * no appointment is drawn, which is the way to look at the calendars' availability on its own.
 *
 * Below the filters, apart from them, is the choice of visit types to shade the availability of. It
 * narrows nothing: an appointment a filter hides is what explains a gap in the shading, so the two are
 * asked separately. Its visit types are offered by the sites chosen, and not by the Visit Type filter.
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
  const [allServices, setAllServices] = useState(defaultValue?.services === undefined);
  const [availabilityServices, setAvailabilityServices] = useState<readonly WithId<HealthcareService>[]>(
    defaultValue?.availabilityServices ?? NONE
  );

  // Key to remount field relying on `defaultValue` on change
  // see: https://github.com/medplum/medplum/issues/10288
  const [serviceFieldKey, setServiceFieldKey] = useState(0);
  const [availabilityFieldKey, setAvailabilityFieldKey] = useState(0);

  const selectServiceFacilities = useCallback(
    (next: WithId<Location>[]): void => {
      setServiceFacilities(next);
      // Drop the chosen visit types that are not available at any of the service facilities now chosen
      const kept = keepServicesAtSites(allServices ? undefined : services, next);
      if ((kept ?? NONE).length !== services.length) {
        setServices(kept ?? NONE);
        setAllServices(kept === undefined);
        setServiceFieldKey((key) => key + 1);
      }
      const keptAvailability = availabilityServices.filter((service) => isServiceKeptAtAnyLocation(service, next));
      if (keptAvailability.length !== availabilityServices.length) {
        setAvailabilityServices(keptAvailability);
        setAvailabilityFieldKey((key) => key + 1);
      }
      onChange({ serviceFacilities: next, services: kept, availabilityServices: keptAvailability });
    },
    [onChange, services, allServices, availabilityServices]
  );

  const selectServices = useCallback(
    (next: WithId<HealthcareService>[]): void => {
      setServices(next);
      setAllServices(false);
      onChange({ serviceFacilities, services: next, availabilityServices });
    },
    [serviceFacilities, availabilityServices, onChange]
  );

  // Ticked, it stands for every visit type, so the list goes. Unticked, the list starts empty: none.
  const toggleAllServices = useCallback(
    (all: boolean): void => {
      setAllServices(all);
      setServices(NONE);
      setServiceFieldKey((key) => key + 1);
      onChange({ serviceFacilities, services: all ? undefined : NONE, availabilityServices });
    },
    [serviceFacilities, availabilityServices, onChange]
  );

  const selectAvailabilityServices = useCallback(
    (next: WithId<HealthcareService>[]): void => {
      setAvailabilityServices(next);
      onChange({ serviceFacilities, services: allServices ? undefined : services, availabilityServices: next });
    },
    [serviceFacilities, services, allServices, onChange]
  );

  return (
    <Stack gap="md">
      <PanelSection title="Filters" description="Narrow the appointments shown, and the calendars by facility.">
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
            placeholder={getServicesPlaceholder(allServices, services.length)}
            showColors
            serviceFacilities={serviceFacilities}
            defaultValue={services}
            onChange={selectServices}
          />
          <Checkbox
            size="xs"
            label="All visit types"
            checked={allServices}
            onChange={(event) => toggleAllServices(event.currentTarget.checked)}
          />
        </Stack>
      </PanelSection>
      <Divider />
      <PanelSection title="Availability" description="Shade the times a visit type could be booked.">
        <AppointmentServiceMultiSelect
          key={availabilityFieldKey}
          label="Show availability for"
          placeholder={availabilityServices.length > 0 ? 'Add a visit type' : 'None shown'}
          description={`Up to ${MAX_AVAILABILITY_SERVICES} visit types`}
          maxValues={MAX_AVAILABILITY_SERVICES}
          showColors
          serviceFacilities={serviceFacilities}
          defaultValue={availabilityServices}
          onChange={selectAvailabilityServices}
        />
      </PanelSection>
    </Stack>
  );
}

function getServicesPlaceholder(all: boolean, chosen: number): string {
  if (all) {
    return 'All visit types';
  }
  return chosen > 0 ? 'Add a visit type' : 'No appointments shown';
}
