import { Group, Text } from '@mantine/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import { Patient, Reference, Resource } from '@medplum/fhirtypes';
import React, { forwardRef, useCallback } from 'react';
import { AsyncAutocomplete, AsyncAutocompleteOption } from '../AsyncAutocomplete/AsyncAutocomplete';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { useResource } from '../useResource/useResource';

/**
 * Defines which search parameters will be used by the type ahead to search for each resourceType
 */
const SEARCH_CODES: Record<string, string> = {
  Schedule: '_id',
  Task: '_id',
  Patient: 'name',
  Practitioner: 'name',
  Questionnaire: 'name',
  ServiceRequest: '_id',
  DiagnosticReport: '_id',
  Specimen: '_id',
  Observation: 'code',
  RequestGroup: '_id',
  ActivityDefinition: 'name',
  User: 'email:contains',
};

export interface ResourceInputProps<T extends Resource = Resource> {
  readonly resourceType: T['resourceType'];
  readonly name: string;
  readonly defaultValue?: T | Reference<T>;
  readonly placeholder?: string;
  readonly loadOnFocus?: boolean;
  readonly onChange?: (value: T | undefined) => void;
}

function toOption<T extends Resource>(resource: T): AsyncAutocompleteOption<T> {
  return {
    value: getReferenceString(resource),
    label: getDisplayString(resource),
    resource,
  };
}

export function ResourceInput<T extends Resource = Resource>(props: ResourceInputProps<T>): JSX.Element {
  const medplum = useMedplum();
  const resourceType = props.resourceType;
  const defaultValue = useResource(props.defaultValue);
  const onChange = props.onChange;

  const loadValues = useCallback(
    async (input: string, signal: AbortSignal): Promise<T[]> => {
      const searchCode = SEARCH_CODES[resourceType] || 'name';
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

  return (
    <AsyncAutocomplete<T>
      name={props.name}
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
