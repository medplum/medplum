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
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly itemComponent?: (props: AsyncAutocompleteOption<T>) => JSX.Element | ReactNode;
  /** Called whenever the selection changes. Receives the full array of selected resources. */
  readonly onChange?: (value: T[]) => void;
  readonly disabled?: boolean;
  readonly label?: AsyncAutocompleteProps<T>['label'];
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
  const { resourceType, searchCriteria } = props;
  const ItemComponent = props.itemComponent ?? DefaultResourceItemComponent;
  const onChange = props.onChange;
  const [items, setItems] = useControllableItems<T | Reference<T>>(props.value, props.defaultValue ?? [], {
    component: 'MultiResourceInput',
    name: props.name,
    maxValues: props.maxValues,
  });
  const { resources, pending, remember } = useResolvedResources(items);

  const loadValues = useCallback(
    async (input: string, signal: AbortSignal): Promise<T[]> => {
      const searchCode = getSearchParamForResourceType(resourceType);
      const searchParams = new URLSearchParams({
        [searchCode]: input ?? '',
        _count: '10',
        ...searchCriteria,
      });

      const resources = await medplum.searchResources(resourceType, searchParams, { signal });
      return resources as unknown as T[];
    },
    [medplum, resourceType, searchCriteria]
  );

  const handleChange = useCallback(
    (newResources: T[]) => {
      remember(newResources);
      setItems(newResources);
      if (onChange) {
        onChange(newResources);
      }
    },
    [remember, setItems, onChange]
  );

  return (
    <AsyncAutocompleteControlled<T>
      disabled={props.disabled || pending}
      loading={pending}
      name={props.name}
      label={props.label}
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
 * Resolves the selection to resources, reading the references that neither the client cache nor this
 * input holds. While a read is pending, the last fully resolved selection is shown.
 * @param value - The selected resources and references.
 * @returns The resources to show, whether a read is pending, and `remember`, which keeps resources the
 * input is handed so a parent that stores them as references doesn't cause a read. An edit made while
 * pending would drop the references still being read.
 */
function useResolvedResources<T extends Resource>(
  value: readonly (T | Reference<T>)[]
): { resources: T[]; pending: boolean; remember: (resources: readonly T[]) => void } {
  const medplum = useMedplum();
  // What this input has read or been handed, by reference, for the client it came from. null marks a
  // reference that could not be read.
  const [known, setKnown] = useState<{ medplum: MedplumClient; byReference: ReadonlyMap<string, T | null> }>();
  const byReference = known?.medplum === medplum ? known.byReference : undefined;

  const { resolved, pendingKey } = useMemo(() => {
    const resolved: T[] = [];
    const unread = new Set<string>();
    for (const item of value) {
      if (isResource<T>(item)) {
        resolved.push(item);
      } else if (isReference<T>(item)) {
        const resource = medplum.getCachedReference(item) ?? byReference?.get(item.reference);
        if (resource) {
          resolved.push(resource);
        } else if (resource === undefined) {
          unread.add(item.reference);
        }
      }
    }
    return { resolved, pendingKey: unread.size > 0 ? JSON.stringify([...unread]) : '' };
  }, [medplum, value, byReference]);

  const learn = useCallback(
    (entries: readonly (readonly [string, T | null])[]): void => {
      setKnown((prev) => ({
        medplum,
        byReference: new Map([...(prev?.medplum === medplum ? prev.byReference : []), ...entries]),
      }));
    },
    [medplum]
  );

  const remember = useCallback(
    (resources: readonly T[]): void => {
      const entries: [string, T][] = [];
      for (const resource of resources) {
        const reference = getReferenceString(resource);
        if (reference) {
          entries.push([reference, resource]);
        }
      }
      learn(entries);
    },
    [learn]
  );

  useEffect(() => {
    if (!pendingKey) {
      return undefined;
    }
    let cancelled = false;
    const references: string[] = JSON.parse(pendingKey);
    Promise.allSettled(references.map((reference) => medplum.readReference<T>({ reference })))
      .then((settled) => {
        if (!cancelled) {
          learn(settled.map((result, i) => [references[i], result.status === 'fulfilled' ? result.value : null]));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [medplum, pendingKey, learn]);

  const [lastResolved, setLastResolved] = useState(resolved);
  if (!pendingKey && resolved !== lastResolved) {
    setLastResolved(resolved);
  }

  return { resources: pendingKey ? lastResolved : resolved, pending: !!pendingKey, remember };
}
