import { Group, Text } from '@mantine/core';
import { getDisplayString, getReferenceString, isPopulated } from '@medplum/core';
import { OperationOutcome, Patient, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { forwardRef, ReactNode, useCallback, useState } from 'react';
import { AsyncAutocomplete, AsyncAutocompleteOption } from '../AsyncAutocomplete/AsyncAutocomplete';
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
  readonly searchCriteria?: Record<string, string>;
  readonly placeholder?: string;
  readonly loadOnFocus?: boolean;
  readonly required?: boolean;
  readonly itemComponent?: (props: AsyncAutocompleteOption<T>) => JSX.Element | ReactNode;
  readonly onChange?: (value: T | undefined) => void;
  readonly disabled?: boolean;
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
  const { resourceType, searchCriteria } = props;
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const defaultValue = useResource(props.defaultValue, setOutcome);
  const ItemComponent = props.itemComponent ?? DefaultItemComponent;
  const onChange = props.onChange;

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
        onChange(newResources[0]);
      }
    },
    [onChange]
  );

  if (isPopulated(props.defaultValue) && !outcome && !defaultValue) {
    // If a default value was specified, but the default resource is not loaded yet,
    // then return null to avoid rendering the input until the default resource is loaded.
    // The Mantine <MultiSelect> component does not reliably handle changes to defaultValue.
    return null;
  }

  return (
    <AsyncAutocomplete<T>
      disabled={props.disabled}
      name={props.name}
      required={props.required}
      itemComponent={ItemComponent}
      defaultValue={defaultValue}
      placeholder={props.placeholder}
      maxValues={1}
      toOption={toOption}
      loadOptions={loadValues}
      onChange={handleChange}
      clearable
    />
  );
}

const DefaultItemComponent = forwardRef<HTMLDivElement, AsyncAutocompleteOption<Resource>>(
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
