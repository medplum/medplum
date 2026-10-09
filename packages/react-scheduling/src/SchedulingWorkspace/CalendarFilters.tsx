// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Group, Stack, Text, ThemeIcon, UnstyledButton, VisuallyHidden } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import { ResourceInput, ResourceName } from '@medplum/react';
import { IconMapPinFilled, IconX } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { AppointmentServiceSelect } from '../AppointmentFinder/AppointmentServiceSelect';
import { isServiceKeptAtLocation } from '../AppointmentFinder/AppointmentServiceSelect.utils';
import { LOCATION_SEARCH_CRITERIA } from '../constants';
import { VisitTypeIcon } from '../VisitTypeIcon';
import classes from './CalendarFilters.module.css';
import { SectionHeader } from './CalendarsPanel/SectionHeader';

/**
 * What the two filters currently narrow calendars to, for `searchScheduleCandidates`.
 *
 * Each field searches the server for its own options, so what is held here is the
 * resource itself rather than an id: a typeahead's list is whatever was last searched
 * for, which is no place to look a choice up. Both keep their identity for as long as
 * the choice stands, so a caller can key an effect on them.
 */
export interface CalendarFilterValues {
  /**
   * The chosen sites, in the order they were added; none for every site. A reference only
   * for a site the filters started on.
   */
  readonly locations?: readonly (Reference<Location> | WithId<Location>)[];
  /** The chosen visit types, in the order they were added; none for every visit type. */
  readonly services?: readonly WithId<HealthcareService>[];
}

const NO_LOCATIONS: readonly (Reference<Location> | WithId<Location>)[] = [];
const NO_SERVICES: readonly WithId<HealthcareService>[] = [];

export interface CalendarFiltersProps {
  /**
   * What the filters start on. Read once on mount, and not reported through
   * `onChange`: the caller already holds it.
   */
  readonly defaultValue?: CalendarFilterValues;
  /** Reports both filters, whichever one changed. */
  readonly onChange: (values: CalendarFilterValues) => void;
  readonly serviceColor?: (service: WithId<HealthcareService>) => string;
}

/**
 * Fields narrowing which calendars are visible, each a section of its own like the
 * calendars under them.
 *
 * Typeaheads rather than lists: a tenant might have dozens of sites or visit
 * types. The same pickers the booking form uses, so a visit type is searched
 * for the same way wherever it is chosen.
 *
 * Choices add up: each one picked is listed under its field, with a button taking it off
 * again, and the field is left empty to search for another.
 *
 * The filters are not peers. Sites decide which visit types are available, so changing
 * the sites drops the chosen visit types none of them holds — the same rule
 * `AppointmentProposalForm` applies when its site changes. A visit type never changes
 * the sites on offer.
 *
 * @param props - Component props
 * @returns A React Node with the Locations and Visit Types sections in it
 */
export function CalendarFilters(props: CalendarFiltersProps): JSX.Element {
  const { defaultValue, onChange, serviceColor } = props;
  const [locations, setLocations] = useState(defaultValue?.locations ?? NO_LOCATIONS);
  const [services, setServices] = useState(defaultValue?.services ?? NO_SERVICES);

  // Keys to remount each field, which keeps what it last picked otherwise: the fields only
  // search, and what is chosen is listed under them.
  // see: https://github.com/medplum/medplum/issues/10288
  const [locationFieldKey, setLocationFieldKey] = useState(0);
  const [serviceFieldKey, setServiceFieldKey] = useState(0);

  const changeLocations = useCallback(
    (next: readonly (Reference<Location> | WithId<Location>)[]): void => {
      setLocations(next);
      // Drop the chosen services none of the sites holds; with no site chosen, all are held.
      const kept =
        next.length === 0
          ? services
          : services.filter((service) => next.some((location) => isServiceKeptAtLocation(service, location)));
      const nextServices = kept.length === services.length ? services : kept;
      setServices(nextServices);
      onChange({ locations: next, services: nextServices });
    },
    [onChange, services]
  );

  const addLocation = useCallback(
    (added: WithId<Location> | undefined): void => {
      setLocationFieldKey((key) => key + 1);
      const reference = added && getReferenceString(added);
      if (added && !locations.some((location) => getReferenceString(location) === reference)) {
        changeLocations([...locations, added]);
      }
    },
    [changeLocations, locations]
  );

  const changeServices = useCallback(
    (next: readonly WithId<HealthcareService>[]): void => {
      setServices(next);
      onChange({ locations, services: next });
    },
    [locations, onChange]
  );

  const serviceIds = useMemo(() => services.map((service) => service.id), [services]);

  const addService = useCallback(
    (added: WithId<HealthcareService> | undefined): void => {
      setServiceFieldKey((key) => key + 1);
      if (added) {
        changeServices([...services, added]);
      }
    },
    [changeServices, services]
  );

  return (
    <Stack gap="xs">
      <SectionHeader title="Locations">
        <Stack gap="xs">
          <div className={classes.field}>
            <ResourceInput<WithId<Location>>
              key={locationFieldKey}
              resourceType="Location"
              name="location"
              label={<VisuallyHidden>Location</VisuallyHidden>}
              placeholder={locations.length > 0 ? 'Add a location' : 'All locations'}
              searchCriteria={LOCATION_SEARCH_CRITERIA}
              onChange={addLocation}
              clearable={false}
            />
          </div>
          {locations.length > 0 && (
            <Stack gap={0}>
              {locations.map((location) => (
                <ChosenRow
                  key={getReferenceString(location)}
                  icon={
                    <ThemeIcon variant="filled" color="gray" radius="sm" size={20}>
                      <IconMapPinFilled size={12} />
                    </ThemeIcon>
                  }
                  label={<ResourceName value={location} link={false} />}
                  name={siteName(location)}
                  onRemove={() =>
                    changeLocations(
                      locations.filter((other) => getReferenceString(other) !== getReferenceString(location))
                    )
                  }
                />
              ))}
            </Stack>
          )}
        </Stack>
      </SectionHeader>
      <Divider />
      <SectionHeader title="Visit Types">
        <Stack gap="xs">
          <div className={classes.field}>
            <AppointmentServiceSelect
              key={serviceFieldKey}
              label={<VisuallyHidden>Visit Type</VisuallyHidden>}
              placeholder={services.length > 0 ? 'Add a visit type' : 'All visit types'}
              required={false}
              locations={locations}
              onChange={addService}
              excludeIds={serviceIds}
              serviceColor={serviceColor}
            />
          </div>
          {services.length > 0 && (
            <Stack gap={0}>
              {services.map((service) => (
                <ChosenRow
                  key={service.id}
                  icon={<VisitTypeIcon color={serviceColor?.(service) ?? 'gray'} />}
                  label={getDisplayString(service)}
                  name={getDisplayString(service)}
                  onRemove={() => changeServices(services.filter((other) => other.id !== service.id))}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </SectionHeader>
    </Stack>
  );
}

interface ChosenRowProps {
  readonly icon: ReactNode;
  readonly label: ReactNode;
  readonly name: string;
  readonly onRemove: () => void;
}

function siteName(location: Reference<Location> | WithId<Location>): string {
  if ('resourceType' in location) {
    return getDisplayString(location);
  }
  return location.display ?? location.reference ?? 'Location';
}

function ChosenRow(props: ChosenRowProps): JSX.Element {
  return (
    <Group gap="sm" wrap="nowrap" className={classes.chosen}>
      {props.icon}
      <Text size="sm" truncate flex={1}>
        {props.label}
      </Text>
      <UnstyledButton className={classes.remove} aria-label={`Remove ${props.name}`} onClick={props.onRemove}>
        <IconX size={16} />
      </UnstyledButton>
    </Group>
  );
}
