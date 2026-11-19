// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Checkbox, CloseButton, Divider, Group, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getDisplayString } from '@medplum/core';
import type { Location } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useState } from 'react';
import { AppointmentServiceMultiSelect, ServiceColorDot } from '../AppointmentFinder/AppointmentServiceSelect';
import { BOOKABLE_SERVICE_FACILITY_SEARCH_CRITERIA } from '../constants';
import { ServiceFacilitiesInput } from '../ServiceFacilityInput';
import type { CalendarFiltersProps, CalendarFilterValues } from './CalendarFilters';
import { MAX_AVAILABILITY_SERVICES } from './CalendarFilters.utils';
import { PanelSection } from './CalendarsPanel/PanelSection';
import type { VisitTypeView, VisitTypeViews } from './visitTypeViews';
import {
  addVisitType,
  canShadeAnother,
  keepVisitTypesAtSites,
  toFilterServices,
  toVisitTypeViews,
} from './visitTypeViews';

const NO_SITES: NonNullable<CalendarFilterValues['serviceFacilities']> = [];

/**
 * Prototype. `CalendarFilters` with one list of visit types in place of its Visit Type filter and its
 * Availability field: a visit type is picked once, and then shown as appointments, as availability, or
 * as both. Reports the same values, so a host tells the two apart only by which it mounts.
 *
 * Every visit type's appointments are drawn until "All appointments" is unticked, after which only the
 * listed ones ticked for it are. Availability is shaded for the listed ones ticked for that, three at
 * most.
 *
 * @param props - Component props
 * @returns The Service Facility field and the list of visit types.
 */
export function UnifiedCalendarFilters(props: CalendarFiltersProps): JSX.Element {
  const { defaultValue, onChange } = props;
  const [serviceFacilities, setServiceFacilities] = useState(defaultValue?.serviceFacilities ?? NO_SITES);
  const [views, setViews] = useState(() => toVisitTypeViews(defaultValue));
  // Remounts the picker once it has added a visit type, as it is not what holds the list.
  const [pickerKey, setPickerKey] = useState(0);

  function update(sites: NonNullable<CalendarFilterValues['serviceFacilities']>, next: VisitTypeViews): void {
    setServiceFacilities(sites);
    setViews(next);
    onChange({ serviceFacilities: sites, ...toFilterServices(next) });
  }

  function updateView(changed: VisitTypeView, change: Partial<VisitTypeView>): void {
    const listed = views.listed.map((view) => (view === changed ? { ...view, ...change } : view));
    update(serviceFacilities, { ...views, listed });
  }

  function selectServiceFacilities(sites: WithId<Location>[]): void {
    update(sites, keepVisitTypesAtSites(views, sites));
  }

  return (
    <Stack gap="md">
      <PanelSection title="Filters" description="Narrow the calendars and appointments by facility.">
        <ServiceFacilitiesInput
          label="Service Facility"
          placeholder={serviceFacilities.length > 0 ? 'Add a service facility' : 'All service facilities'}
          searchCriteria={BOOKABLE_SERVICE_FACILITY_SEARCH_CRITERIA}
          defaultValue={serviceFacilities}
          onChange={selectServiceFacilities}
        />
      </PanelSection>
      <Divider />
      <PanelSection
        title="Visit Types"
        description={`Add a visit type, then show its appointments, its availability, or both. Availability for up to ${MAX_AVAILABILITY_SERVICES}.`}
      >
        <Stack gap="sm">
          <AppointmentServiceMultiSelect
            key={pickerKey}
            label="Visit Type"
            placeholder="Add a visit type"
            // Holds nothing itself: each pick is added to the list below.
            maxValues={0}
            showColors
            serviceFacilities={serviceFacilities}
            onChange={([picked]) => {
              if (picked) {
                update(serviceFacilities, addVisitType(views, picked));
                setPickerKey((key) => key + 1);
              }
            }}
          />
          <Checkbox
            size="xs"
            label="All appointments"
            description="Draw every visit type's appointments, listed or not."
            checked={views.allAppointments}
            onChange={(event) => update(serviceFacilities, { ...views, allAppointments: event.currentTarget.checked })}
          />
          {views.listed.map((view) => {
            const name = getDisplayString(view.service);
            return (
              <Box key={view.service.id} role="group" aria-label={name}>
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap={6} wrap="nowrap" miw={0}>
                    <ServiceColorDot service={view.service} />
                    <Text size="sm" fw={600} truncate>
                      {name}
                    </Text>
                  </Group>
                  <CloseButton
                    size="sm"
                    aria-label={`Remove ${name}`}
                    onClick={() =>
                      update(serviceFacilities, { ...views, listed: views.listed.filter((other) => other !== view) })
                    }
                  />
                </Group>
                <Group gap="md" mt={4} pl={14}>
                  <Checkbox
                    size="xs"
                    label="Appointments"
                    aria-label={`${name} appointments`}
                    // Drawn whatever this says while every visit type's are.
                    checked={views.allAppointments || view.appointments}
                    disabled={views.allAppointments}
                    onChange={(event) => updateView(view, { appointments: event.currentTarget.checked })}
                  />
                  <Checkbox
                    size="xs"
                    label="Availability"
                    aria-label={`${name} availability`}
                    checked={view.availability}
                    disabled={!view.availability && !canShadeAnother(views)}
                    onChange={(event) => updateView(view, { availability: event.currentTarget.checked })}
                  />
                </Group>
              </Box>
            );
          })}
        </Stack>
      </PanelSection>
    </Stack>
  );
}
