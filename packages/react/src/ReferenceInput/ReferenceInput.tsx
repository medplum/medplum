import { Group, NativeSelect } from '@mantine/core';
import { MedplumClient, createReference, isEmpty } from '@medplum/core';
import { Reference, Resource, ResourceType, StructureDefinition } from '@medplum/fhirtypes';
import { useEffect, useMemo, useState } from 'react';
import { ResourceInput } from '../ResourceInput/ResourceInput';
import { ResourceTypeInput } from '../ResourceTypeInput/ResourceTypeInput';
import { useMedplum } from '@medplum/react-hooks';

export interface ReferenceInputProps {
  name: string;
  placeholder?: string;
  defaultValue?: Reference;
  targetTypes?: string[];
  searchCriteria?: Record<string, string>;
  autoFocus?: boolean;
  required?: boolean;
  onChange?: (value: Reference | undefined) => void;
}

type TargetType = {
  type: 'resourceType' | 'profile';
  resourceType?: string;
  value: string;
};

export function ReferenceInput(props: ReferenceInputProps): JSX.Element {
  const medplum = useMedplum();
  const [targetTypes, setTargetTypes] = useState<TargetType[]>(() => getTargetTypes(props.targetTypes));
  const [value, setValue] = useState<Reference | undefined>(props.defaultValue);
  const [targetType, setTargetType] = useState<TargetType | undefined>(() =>
    getInitialTargetType(props.defaultValue, targetTypes)
  );
  const [resourceType, setResourceType] = useState<ResourceType | undefined>();

  const searchCriteria = useMemo<ReferenceInputProps['searchCriteria']>(() => {
    if (targetType?.type !== 'profile' || !targetType?.value) {
      return props.searchCriteria;
    }

    return { ...props.searchCriteria, _profile: targetType.value };
  }, [props.searchCriteria, targetType]);

  useEffect(() => {
    const promises: Promise<TargetType>[] = [];
    let fetchedAtLeastOne: boolean = false;
    for (const tt of targetTypes) {
      if (tt.type === 'profile' && isEmpty(tt.resourceType)) {
        console.log(`fetching ${tt.value}`);
        const promise = fetchResourceType(medplum, tt.value)
          .then((partialSD) => {
            if (partialSD?.type) {
              return { ...tt, resourceType: partialSD.type satisfies string };
            }
            return tt;
          })
          .catch((reason) => {
            console.error(reason);
            return tt;
          });
        promises.push(promise);
        fetchedAtLeastOne ||= true;
      } else {
        promises.push(Promise.resolve(tt));
      }
    }

    Promise.all(promises)
      .then((results) => {
        if (fetchedAtLeastOne) {
          if (targetType) {
            const index = results.findIndex((tt) => tt.resourceType === targetType.resourceType);
            if (index >= 0) {
              console.log('updated target type', results[index] === targetType);
              setTargetType(results[index]);
            } else {
              console.log(`defaultValue had unexpected resourceType: ${targetType.resourceType}`);
            }
          }
          setTargetTypes(results);
        }
      })
      .catch(console.error);
  }, [medplum, targetType, targetTypes]);

  useEffect(() => {
    if (targetType?.resourceType !== resourceType) {
      setResourceType(targetType?.resourceType as ResourceType);
    }
  }, [resourceType, targetType]);

  function setValueHelper(newValue: Reference | undefined): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Group spacing="xs" grow noWrap>
      {targetTypes && targetTypes.length > 1 && (
        <NativeSelect
          data-autofocus={props.autoFocus}
          data-testid="reference-input-resource-type-select"
          defaultValue={resourceType}
          autoFocus={props.autoFocus}
          onChange={(e) => {
            const newValue = e.currentTarget.value;
            setTargetType(targetTypes.find((tt) => tt.value === newValue));
            setResourceType(newValue as ResourceType);
          }}
          data={targetTypes.map((tt) => tt.value)}
        />
      )}
      {!targetTypes && (
        <ResourceTypeInput
          autoFocus={props.autoFocus}
          testId="reference-input-resource-type-input"
          defaultValue={resourceType}
          onChange={setResourceType}
          name={props.name + '-resourceType'}
          placeholder="Resource Type"
        />
      )}
      <ResourceInput
        resourceType={resourceType as ResourceType}
        name={props.name + '-id'}
        required={props.required}
        placeholder={props.placeholder}
        defaultValue={value}
        searchCriteria={searchCriteria}
        onChange={(item: Resource | undefined) => {
          setValueHelper(item ? createReference(item) : undefined);
        }}
      />
    </Group>
  );
}

function getTargetTypes(resourceTypesOrProfileUrls: string[] | undefined): TargetType[] {
  const results: TargetType[] = [];
  if (
    !resourceTypesOrProfileUrls ||
    resourceTypesOrProfileUrls.length === 0 ||
    (resourceTypesOrProfileUrls.length === 1 && resourceTypesOrProfileUrls[0] === 'Resource')
  ) {
    return results;
  }

  for (const type of resourceTypesOrProfileUrls) {
    // TODO is there a less hacky way to distinguish resourceType from URLs?
    if (type.includes('/')) {
      results.push({ type: 'profile', value: type });
    } else {
      results.push({ type: 'resourceType', value: type, resourceType: type });
    }
  }
  return results;
}

function getInitialTargetType(defaultValue: Reference | undefined, targetTypes: TargetType[]): TargetType | undefined {
  const defaultValueResourceType = defaultValue?.reference?.split('/')[0];
  if (defaultValueResourceType) {
    const targetType = targetTypes.find((tt) => tt.resourceType === defaultValueResourceType);
    if (targetType) {
      return targetType;
    }

    const orphan: TargetType = {
      type: 'resourceType',
      value: defaultValueResourceType,
      resourceType: defaultValueResourceType,
    };
    console.log(`initializing with orphaned targetType: ${JSON.stringify(orphan)}`);
    return orphan;
  }

  if (targetTypes.length > 0) {
    return targetTypes[0];
  }

  return undefined;
}

interface ResourceTypeGraphQLResponse {
  readonly data: {
    readonly StructureDefinitionList: Pick<StructureDefinition, 'type'>[];
  };
}
async function fetchResourceType(
  medplum: MedplumClient,
  profileUrl: string
): Promise<Pick<StructureDefinition, 'type'> | undefined> {
  // TODO{profiles}: centralize _sort for profiles
  const query = `{
      StructureDefinitionList(url: "${profileUrl}", _sort: "_lastUpdated", _count: 1) {
        type
      }
    }`.replace(/\s+/g, ' ');

  const response = (await medplum.graphql(query)) as ResourceTypeGraphQLResponse;

  return response.data.StructureDefinitionList[0];
}
