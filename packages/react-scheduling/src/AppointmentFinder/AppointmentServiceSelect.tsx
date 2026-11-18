// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Center, Group, Pill, useMantineTheme } from '@mantine/core';
import type { MedplumClient, WithId } from '@medplum/core';
import { formatCodeableConcept, getDisplayString, getReferenceString, hasSchedulingParameters } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { AsyncAutocomplete } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { fallbackColorIndex, getSchedulingColor, resolveThemeColor } from '../colors';
import { AppointmentOptionRow } from './AppointmentOptionRow';
import { getServiceDurationMinutes } from './AppointmentServiceSelect.utils';

/** Enough to hold every visit type a practice offers, so the field can list them all. */
const SERVICE_PAGE_SIZE = 100;

/**
 * `_sort=name` stays on both requests even though the field orders the merge itself:
 * it makes each response its own first page by name, and the true first page is
 * contained in the union of the two.
 */
const SERVICE_SEARCH_CRITERIA = {
  'active:not': 'false',
  _sort: 'name',
};

export interface AppointmentServiceSelectProps {
  readonly defaultValue?: WithId<HealthcareService>;
  readonly onChange: (service: WithId<HealthcareService> | undefined) => void;
  /** A chosen site, which narrows the services on offer to the ones held there. */
  readonly serviceFacility?: WithId<Location> | Reference<Location>;
  readonly label?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
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
 * We attempt to load all visit types when the viewer first interacts with
 * this field and apply filters locally; if there are too many results we fall
 * back to server-side searching.
 *
 * @param props - The React props.
 * @returns The service field.
 */
export function AppointmentServiceSelect(props: AppointmentServiceSelectProps): JSX.Element {
  const {
    serviceFacility,
    defaultValue,
    onChange,
    label = 'Visit type',
    placeholder = 'Search visit types',
    required,
    error,
    disabled,
  } = props;
  const loadOptions = useServiceOptions(serviceFacility && getReferenceString(serviceFacility));
  const handleChange = useCallback((services: WithId<HealthcareService>[]) => onChange(services[0]), [onChange]);

  return (
    <AsyncAutocomplete<WithId<HealthcareService>>
      name="service"
      label={label}
      placeholder={placeholder}
      required={required}
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

export interface AppointmentServiceMultiSelectProps {
  readonly defaultValue?: readonly WithId<HealthcareService>[];
  readonly onChange: (services: WithId<HealthcareService>[]) => void;
  /** The chosen sites, which narrow the services on offer to the ones held at any of them. */
  readonly serviceFacilities?: readonly (WithId<Location> | Reference<Location>)[];
  readonly label?: string;
  readonly placeholder?: string;
  readonly description?: string;
  /** The most that can be chosen. The search box goes once that many are. */
  readonly maxValues?: number;
  /** Marks each visit type, offered or chosen, with its calendar color, for a field whose choices are drawn in them. */
  readonly showColors?: boolean;
}

/**
 * Prototype. Chooses any number of visit types, for a field that filters rather than books. Offers
 * what {@link AppointmentServiceSelect} offers.
 *
 * @param props - The React props.
 * @returns The field.
 */
export function AppointmentServiceMultiSelect(props: AppointmentServiceMultiSelectProps): JSX.Element {
  const { serviceFacilities, defaultValue, onChange, label = 'Visit types', placeholder } = props;
  const { description, maxValues, showColors } = props;
  // ORed, as a search's comma-separated values are.
  const loadOptions = useServiceOptions(serviceFacilities?.map(getReferenceString).join(',') || undefined);
  return (
    <AsyncAutocomplete<WithId<HealthcareService>>
      name="services"
      label={label}
      placeholder={placeholder}
      description={description}
      maxValues={maxValues}
      defaultValue={defaultValue && [...defaultValue]}
      toOption={toOption}
      loadOptions={loadOptions}
      itemComponent={showColors ? ServiceColorItem : ServiceItem}
      pillComponent={showColors ? ServiceColorPill : undefined}
      onChange={onChange}
    />
  );
}

function ServiceColorPill(props: {
  readonly item: AsyncAutocompleteOption<WithId<HealthcareService>>;
  readonly disabled?: boolean;
  readonly onRemove: () => void;
}): JSX.Element {
  const { item, disabled, onRemove } = props;
  return (
    <Pill withRemoveButton={!disabled} onRemove={onRemove}>
      <ServiceColorDot service={item.resource} mr={6} />
      {item.label}
    </Pill>
  );
}

// The option as `ServiceItem` draws it, behind the dot its pill will carry once it is chosen.
function ServiceColorItem(props: Readonly<AsyncAutocompleteOption<WithId<HealthcareService>>>): JSX.Element {
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      {/* As tall as the label's line, so the dot sits beside the name rather than the detail. */}
      <Center h="calc(var(--mantine-font-size-sm) * var(--mantine-line-height-sm))">
        <ServiceColorDot service={props.resource} />
      </Center>
      <ServiceItem {...props} />
    </Group>
  );
}

function ServiceColorDot(props: { readonly service: WithId<HealthcareService>; readonly mr?: number }): JSX.Element {
  const theme = useMantineTheme();
  const color = resolveThemeColor(
    theme,
    getSchedulingColor(props.service),
    fallbackColorIndex(getReferenceString(props.service))
  );
  return <Box component="span" display="inline-block" w={8} h={8} mr={props.mr} bg={`${color}.6`} bdrs="50%" />;
}

type LoadServiceOptions = (input: string, signal: AbortSignal) => Promise<WithId<HealthcareService>[]>;

function useServiceOptions(serviceFacilityReference: string | undefined): LoadServiceOptions {
  const medplum = useMedplum();

  // Resolves to undefined when the read failed, leaving search to the server.
  const readCatalogRef = useRef<() => Promise<ServiceSearchResult | undefined>>(undefined);

  useEffect(() => {
    // Not a keystroke's signal: the field aborts those on the next keystroke.
    const controller = new AbortController();
    let catalog: Promise<ServiceSearchResult | undefined> | undefined;
    readCatalogRef.current = () => {
      catalog ??= searchServices(medplum, serviceFacilityReference, {
        count: SERVICE_PAGE_SIZE,
        signal: controller.signal,
      }).catch(() => undefined);
      return catalog;
    };
    return () => controller.abort();
  }, [medplum, serviceFacilityReference]);

  return useCallback(
    async (input: string, signal: AbortSignal): Promise<WithId<HealthcareService>[]> => {
      // A site change while this waits replaces the reader, and makes this answer the old site's.
      const readCatalog = readCatalogRef.current;
      const catalog = await readCatalog?.();
      if (readCatalogRef.current !== readCatalog) {
        return [];
      }
      if (catalog?.complete) {
        const query = input.toLowerCase();
        return catalog.services.filter((service) => getDisplayString(service).toLowerCase().includes(query));
      }
      // An incomplete read still holds the first page by name, which is all an empty search asks for.
      if (catalog && !input) {
        return catalog.services.slice(0, SERVICE_PAGE_SIZE);
      }
      const { services } = await searchServices(medplum, serviceFacilityReference, {
        count: SERVICE_PAGE_SIZE,
        name: input,
        signal,
      });
      return readCatalogRef.current === readCatalog ? services.slice(0, SERVICE_PAGE_SIZE) : [];
    },
    [medplum, serviceFacilityReference]
  );
}

interface ServiceSearchOptions {
  readonly count: number;
  readonly name?: string;
  readonly signal: AbortSignal;
}

interface ServiceSearchResult {
  /** The schedulable visit types found, by name. */
  readonly services: WithId<HealthcareService>[];
  /** False when any search filled its page, so more may be out there. */
  readonly complete: boolean;
}

async function searchServices(
  medplum: MedplumClient,
  serviceFacilityReference: string | undefined,
  options: ServiceSearchOptions
): Promise<ServiceSearchResult> {
  const criteria = new URLSearchParams({ ...SERVICE_SEARCH_CRITERIA, _count: String(options.count) });
  if (options.name) {
    // Anywhere in the name, since a visit type is often known by a word past its first.
    criteria.set('name:contains', options.name);
  }
  // A `location` search only matches services that name one, so services that name
  // no location need their own `location:missing` search.
  const searches = serviceFacilityReference
    ? [withParam(criteria, 'location', serviceFacilityReference), withParam(criteria, 'location:missing', 'true')]
    : [criteria];
  const pages = await Promise.all(
    searches.map(async (params) => medplum.searchResources('HealthcareService', params, { signal: options.signal }))
  );
  // Judged before the scheduling filter: unschedulable services still take up room in a page.
  const complete = pages.every((page) => page.length < options.count);
  // The scheduling filter is applied here rather than in the search because it
  // reads an extension, which no search parameter covers.
  const services = pages.flatMap((page) => page.filter(hasSchedulingParameters));
  // Disjoint by construction — one needs `location` present, the other needs it
  // absent — so the merge is a sort with nothing to deduplicate, and where a visit
  // type was found never shows in the order.
  services.sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''));
  return { services, complete };
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
