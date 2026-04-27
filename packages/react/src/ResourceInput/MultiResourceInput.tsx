// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Text } from '@mantine/core';
import { getDisplayString, getReferenceString, isReference, isResource } from '@medplum/core';
import type { Patient, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncAutocompleteOption, AsyncAutocompleteProps } from '../AsyncAutocomplete/AsyncAutocomplete';
import { AsyncAutocomplete } from '../AsyncAutocomplete/AsyncAutocomplete';
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
   * Initial selected values. Each entry may be a full resource or a reference that will be
   * resolved on mount. Treated as uncontrolled — changes after mount are ignored.
   */
  readonly defaultValue?: (T | Reference<T>)[];
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
}

export function MultiResourceInput<T extends Resource = Resource>(
  props: MultiResourceInputProps<T>
): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, searchCriteria } = props;
  const ItemComponent = props.itemComponent ?? DefaultResourceItemComponent;
  const onChange = props.onChange;

  // Capture initial defaultValue at mount — treated as uncontrolled (initial-only).
  // The Mantine MultiSelect component does not reliably handle changes to defaultValue after mount.
  const initialDefaultValue = useRef(props.defaultValue);

  // undefined = still resolving references, [] = ready with no defaults, T[] = ready with resolved resources
  const [defaultResources, setDefaultResources] = useState<T[] | undefined>(
    !props.defaultValue || props.defaultValue.length === 0 ? [] : undefined
  );

  useEffect(() => {
    let cancelled = false;
    const items = initialDefaultValue.current;

    if (items && items.length > 0) {
      Promise.allSettled(
        items.map((item): Promise<T> => {
          if (isResource(item)) {
            return Promise.resolve(item);
          }
          if (isReference(item)) {
            const ref: Reference<T> = item;
            return medplum.readReference(ref);
          }
          return Promise.reject(new Error('Not a resolvable item'));
        })
      )
        .then((settled) => {
          if (!cancelled) {
            setDefaultResources(settled.filter((r) => r.status === 'fulfilled').map((r) => r.value));
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [medplum]);

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
      if (onChange) {
        onChange(newResources);
      }
    },
    [onChange]
  );

  if (defaultResources === undefined) {
    // Default references are still resolving — defer render to avoid
    // Mantine MultiSelect issues with defaultValue changing after mount.
    return null;
  }

  return (
    <AsyncAutocomplete<T>
      disabled={props.disabled}
      name={props.name}
      label={props.label}
      error={props.error}
      required={props.required}
      itemComponent={ItemComponent}
      defaultValue={defaultResources}
      placeholder={props.placeholder}
      maxValues={props.maxValues}
      toOption={toOption}
      loadOptions={loadValues}
      onChange={handleChange}
      clearable
    />
  );
}
