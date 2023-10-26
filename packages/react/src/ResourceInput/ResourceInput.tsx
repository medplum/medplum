import { Group, Text } from '@mantine/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import { OperationOutcome, Patient, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import React, { forwardRef, useCallback, useState } from 'react';
import { AsyncAutocomplete, AsyncAutocompleteOption } from '../AsyncAutocomplete/AsyncAutocomplete';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';

/**
 * Search parameter overrides for specific resource types.
 * Use this to specify the search parameter to use for a given resource type.
 * Otherwise it will fallback to "name" if the resource type is in NAME_RESOURCE_TYPES.
 * Otherwise it will fallback to "_id".
 */
const SEARCH_CODES: Record<string, string> = {
  Observation: 'code',
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
  'RiskEvidenceSynthesis',
  'SearchParameter',
  'StructureDefinition',
  'StructureMap',
  'TerminologyCapabilities',
  'TestScript',
  'UserConfiguration',
  'ValueSet',
];

export interface ResourceInputProps<T extends Resource = Resource> {
  readonly resourceType: T['resourceType'];
  readonly name: string;
  readonly defaultValue?: T | Reference<T>;
  readonly placeholder?: string;
  readonly loadOnFocus?: boolean;
  readonly required?: boolean;
  readonly onChange?: (value: T | undefined) => void;
}

function toOption<T extends Resource>(resource: T): AsyncAutocompleteOption<T> {
  return {
    value: getReferenceString(resource),
    label: getDisplayString(resource),
    resource,
  };
}

export function ResourceInput<T extends Resource = Resource>(props: ResourceInputProps<T>): JSX.Element | null {
  const medplum = useMedplum();
  const resourceType = props.resourceType;
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const defaultValue = useResource(props.defaultValue, setOutcome);
  const onChange = props.onChange;

  const loadValues = useCallback(
    async (input: string, signal: AbortSignal): Promise<T[]> => {
      const searchCode = getSearchParamForResourceType(resourceType);
      const searchParams = new URLSearchParams({
        [searchCode]: input,
        _count: '10',
      });

      const resources = await medplum.searchResources(resourceType, searchParams, { signal });
      return resources as unknown as T[];
    },
    [medplum, resourceType]
  );

  const handleChange = useCallback(
    (newResources: T[]) => {
      if (onChange) {
        onChange(newResources[0]);
      }
    },
    [onChange]
  );

  if (props.defaultValue && !outcome && !defaultValue) {
    // If a default value was specified, but the default resource is not loaded yet,
    // then return null to avoid rendering the input until the default resource is loaded.
    // The Mantine <MultiSelect> component does not reliably handle changes to defaultValue.
    return null;
  }

  return (
    <AsyncAutocomplete<T>
      name={props.name}
      required={props.required}
      itemComponent={ItemComponent}
      defaultValue={defaultValue}
      placeholder={props.placeholder}
      maxSelectedValues={1}
      toKey={getReferenceString}
      toOption={toOption}
      loadOptions={loadValues}
      onChange={handleChange}
      clearable
    />
  );
}

const ItemComponent = forwardRef<HTMLDivElement, any>(({ label, resource, ...others }: any, ref) => {
  return (
    <div ref={ref} {...others}>
      <Group noWrap>
        <ResourceAvatar value={resource} />
        <div>
          <Text>{label}</Text>
          <Text size="xs" color="dimmed">
            {(resource as Patient).birthDate}
          </Text>
        </div>
      </Group>
    </div>
  );
});

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
