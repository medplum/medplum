// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Text } from '@mantine/core';
import type { MedplumClient } from '@medplum/core';
import { getDisplayString, getReferenceString, isReference, isResource } from '@medplum/core';
import type { Patient, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import type { AsyncAutocompleteOption, AsyncAutocompleteProps } from '../AsyncAutocomplete/AsyncAutocomplete';
import { AsyncAutocompleteControlled } from '../AsyncAutocomplete/AsyncAutocomplete';
import { useControllableItems } from '../AsyncAutocomplete/useControllableItems';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';

/**
 * Search parameter overrides for specific resource types.
 * Use this to specify the search parameter to use for a given resource type.
 * Otherwise it will fallback to "name" if the resource type is in NAME_RESOURCE_TYPES.
 * Otherwise it will fallback to "_id".
 */
const SEARCH_CODES: Record<string, string> = {
  Device: 'device-name',
  Observation: 'code',
  Subscription: 'criteria',
  User: 'email:contains',
};

/**
 * Resource types that should use the "name" search parameter.
 * This is the full list of resource types that have a "name" search parameter.
 * Otherwise it will fallback to "_id".
 */
const NAME_RESOURCE_TYPES = [
  'AccessPolicy',
  'Account',
  'ActivityDefinition',
  'Bot',
  'CapabilityStatement',
  'CareTeam',
  'ClientApplication',
  'CodeSystem',
  'CompartmentDefinition',
  'ConceptMap',
  'EffectEvidenceSynthesis',
  'Endpoint',
  'EventDefinition',
  'Evidence',
  'EvidenceVariable',
  'ExampleScenario',
  'GraphDefinition',
  'Group',
  'HealthcareService',
  'ImplementationGuide',
  'InsurancePlan',
  'Library',
  'Location',
  'Measure',
  'MedicinalProduct',
  'MessageDefinition',
  'NamingSystem',
  'OperationDefinition',
  'Organization',
  'Patient',
  'Person',
  'PlanDefinition',
  'Practitioner',
  'Project',
  'Questionnaire',
  'RelatedPerson',
  'ResearchDefinition',
  'ResearchElementDefinition',
  'ResearchStudy',
  'RiskEvidenceSynthesis',
  'SearchParameter',
  'StructureDefinition',
  'StructureMap',
  'TerminologyCapabilities',
  'TestScript',
  'UserConfiguration',
  'ValueSet',
];

/**
 * Converts a FHIR resource to an AsyncAutocomplete option.
 * @param resource - The FHIR resource.
 * @returns An AsyncAutocompleteOption for the resource.
 */
function toOption<T extends Resource>(resource: T): AsyncAutocompleteOption<T> {
  return {
    value: getReferenceString(resource) ?? '',
    label: getDisplayString(resource),
    resource,
  };
}

/**
 * Returns the search parameter to use for the given resource type.
 * If the resource type is in SEARCH_CODES, then that value is used.
 * Otherwise, if the resource type is in NAME_RESOURCE_TYPES, then "name" is used.
 * Otherwise, "_id" is used.
 * @param resourceType - The FHIR resource type.
 * @returns The search parameter to use for the autocomplete input.
 */
function getSearchParamForResourceType(resourceType: string): string {
  return SEARCH_CODES[resourceType] ?? (NAME_RESOURCE_TYPES.includes(resourceType) ? 'name' : '_id');
}

/**
 * Default item component for resource autocomplete inputs.
 * Displays the resource avatar, display name, and birth date or ID.
 */
export const DefaultResourceItemComponent = forwardRef<HTMLDivElement, AsyncAutocompleteOption<Resource>>(
  ({ label, resource, active: _active, ...others }: AsyncAutocompleteOption<Resource>, ref) => {
    return (
      <div ref={ref} {...others}>
        <Group wrap="nowrap">
          <ResourceAvatar value={resource} />
          <div>
            <Text>{label}</Text>
            <Text size="xs" c="dimmed">
              {(resource as Patient).birthDate || resource.id}
            </Text>
          </div>
        </Group>
      </div>
    );
  }
);

DefaultResourceItemComponent.displayName = 'DefaultResourceItemComponent';

export interface MultiResourceInputProps<T extends Resource = Resource> {
  readonly resourceType: T['resourceType'];
  readonly name: string;
  /**
   * Initial selected values, each a full resource or a reference to resolve. Treated as
   * uncontrolled — changes after mount are ignored.
   */
  readonly defaultValue?: (T | Reference<T>)[];
  /**
   * The selected values, each a full resource or a reference to resolve. Passing this (`[]` for none)
   * makes the input controlled; see `AsyncAutocompleteProps.value`. A reference that cannot be read
   * is left out of the selection.
   */
  readonly value?: readonly (T | Reference<T>)[];
  readonly searchCriteria?: Record<string, string>;
  /** The search parameter, with any modifier, that the typed text is sent as (e.g. `name:contains`). Defaults to one chosen by resource type. */
  readonly searchParam?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly itemComponent?: (props: AsyncAutocompleteOption<T>) => JSX.Element | ReactNode;
  /** Called whenever the selection changes. Receives the full array of selected resources. */
  readonly onChange?: (value: T[]) => void;
  readonly disabled?: boolean;
  readonly label?: AsyncAutocompleteProps<T>['label'];
  /**
   * Names the field for assistive technology, for use instead of a visible `label` (don't pass both). The name
   * goes on the search box and on a group around the whole field, which keeps the chosen resources named while the
   * search box is hidden (disabled or at `maxValues`).
   */
  readonly 'aria-label'?: AsyncAutocompleteProps<T>['aria-label'];
  readonly error?: AsyncAutocompleteProps<T>['error'];
  /** Maximum number of resources that can be selected. Defaults to uncapped. */
  readonly maxValues?: number;
  /** Render the options dropdown inside the DOM tree (not a portal); defaults to portalled. */
  readonly withinPortal?: boolean;
  /** Whether to show a button that clears the whole selection. Defaults to true. */
  readonly clearable?: boolean;
}

export function MultiResourceInput<T extends Resource = Resource>(props: MultiResourceInputProps<T>): JSX.Element {
  const medplum = useMedplum();
  const { resourceType, searchCriteria, searchParam } = props;
  const ItemComponent = props.itemComponent ?? DefaultResourceItemComponent;
  const onChange = props.onChange;
  const [items, setItems] = useControllableItems<T | Reference<T>>(props.value, props.defaultValue ?? [], {
    component: 'MultiResourceInput',
    name: props.name,
    maxValues: props.maxValues,
  });
  const { resources, pending } = useResolvedResources(items);

  const loadValues = useCallback(
    async (input: string, signal: AbortSignal): Promise<T[]> => {
      const searchParams = new URLSearchParams({
        [searchParam ?? getSearchParamForResourceType(resourceType)]: input ?? '',
        _count: '10',
        ...searchCriteria,
      });

      const resources = await medplum.searchResources(resourceType, searchParams, { signal });
      return resources as unknown as T[];
    },
    [medplum, resourceType, searchCriteria, searchParam]
  );

  const handleChange = useCallback(
    (newResources: T[]) => {
      setItems(newResources);
      if (onChange) {
        onChange(newResources);
      }
    },
    [setItems, onChange]
  );

  return (
    <AsyncAutocompleteControlled<T>
      disabled={props.disabled || pending}
      loading={pending}
      name={props.name}
      label={props.label}
      aria-label={props['aria-label']}
      error={props.error}
      required={props.required}
      itemComponent={ItemComponent}
      value={resources}
      placeholder={props.placeholder}
      maxValues={props.maxValues}
      toOption={toOption}
      loadOptions={loadValues}
      onChange={handleChange}
      withinPortal={props.withinPortal}
      clearable={props.clearable ?? true}
    />
  );
}

/**
 * Resolves the selection to resources, reading references the client hasn't cached. While a read is
 * pending, the last fully resolved selection is shown.
 * @param value - The selected resources and references.
 * @returns The resources to show, and whether a read is pending. An edit made while pending would drop
 * the references still being read.
 */
function useResolvedResources<T extends Resource>(
  value: readonly (T | Reference<T>)[]
): { resources: T[]; pending: boolean } {
  const medplum = useMedplum();
  // The last read, by the client that made it and the uncached references it covered. null marks a
  // reference that could not be read.
  const [read, setRead] = useState<{ medplum: MedplumClient; key: string; results: Map<string, T | null> }>();

  const { resolved, pendingKey } = useMemo(() => {
    const uncached = new Set<string>();
    for (const item of value) {
      if (!isResource<T>(item) && isReference<T>(item) && !medplum.getCachedReference(item)) {
        uncached.add(item.reference);
      }
    }
    const key = uncached.size > 0 ? JSON.stringify([...uncached]) : '';
    const results = read?.medplum === medplum && read.key === key ? read.results : undefined;

    const resolved: T[] = [];
    for (const item of value) {
      if (isResource<T>(item)) {
        resolved.push(item);
      } else if (isReference<T>(item)) {
        const resource = medplum.getCachedReference(item) ?? results?.get(item.reference);
        if (resource) {
          resolved.push(resource);
        }
      }
    }
    return { resolved, pendingKey: key && !results ? key : '' };
  }, [medplum, value, read]);

  useEffect(() => {
    if (!pendingKey) {
      return undefined;
    }
    let cancelled = false;
    const references: string[] = JSON.parse(pendingKey);
    Promise.allSettled(references.map((reference) => medplum.readReference<T>({ reference })))
      .then((settled) => {
        if (!cancelled) {
          const results = new Map<string, T | null>();
          settled.forEach((result, i) => {
            results.set(references[i], result.status === 'fulfilled' ? result.value : null);
          });
          setRead({ medplum, key: pendingKey, results });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [medplum, pendingKey]);

  const [lastResolved, setLastResolved] = useState(resolved);
  if (!pendingKey && resolved !== lastResolved) {
    setLastResolved(resolved);
  }

  return { resources: pendingKey ? lastResolved : resolved, pending: !!pendingKey };
}
