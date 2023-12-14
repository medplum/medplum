import { Group, NativeSelect } from '@mantine/core';
import { MedplumClient, createReference } from '@medplum/core';
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
  const [resourceType, setResourceType] = useState<ResourceType | undefined>(() =>
    getInitialResourceType(props.defaultValue, targetTypes)
  );
  const searchCriteria = useMemo<ReferenceInputProps['searchCriteria']>(() => {
    console.log(targetType);
    if (targetType?.type !== 'profile' || !targetType?.value) {
      return props.searchCriteria;
    }

    console.log({ ...props.searchCriteria, _profile: targetType.value });
    return { ...props.searchCriteria, _profile: targetType.value };
  }, [props.searchCriteria, targetType]);

  useEffect(() => {
    // if targetType not set or resourceType is already known, nothing to do
    if (!targetType || targetType.resourceType) {
      return;
    }

    fetchResourceType(medplum, targetType.value)
      .then((resp) => {
        if (resp?.type) {
          const newTargetType = { ...targetType, resourceType: resp.type satisfies string };
          setTargetType(newTargetType);
          setResourceType(newTargetType.resourceType satisfies string as ResourceType);

          // given the way getInitialTargetType handles defaultValue, i.e. the function
          // will create a TargetType even if defaultValue is not found in targetTypes,
          // it's okay if targetType isn't found in targetTypes
          const index = targetTypes.indexOf(targetType);
          if (index >= 0) {
            const newTargetTypes = [...targetTypes];
            newTargetTypes[index] = newTargetType;
            setTargetTypes(newTargetTypes);
          } else {
            console.log('not in array');
          }
        }
      })
      .catch(console.error);
  }, [medplum, targetType, targetTypes]);

  function setValueHelper(newValue: Reference | undefined): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }
  console.log(targetType);

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

function getTargetTypes(targetTypes: string[] | undefined): TargetType[] {
  const results: TargetType[] = [];
  if (!targetTypes || targetTypes.length === 0 || (targetTypes.length === 1 && targetTypes[0] === 'Resource')) {
    return results;
  }

  for (const type of targetTypes) {
    if (type.includes('/')) {
      // TODO is there a better way to
      results.push({ type: 'profile', value: type });
    } else {
      results.push({ type: 'resourceType', value: type, resourceType: type });
    }
  }
  return results;
}

function getInitialResourceType(
  defaultValue: Reference | undefined,
  targetTypes: TargetType[]
): ResourceType | undefined {
  const defaultValueResourceType = defaultValue?.reference?.split('/')[0];
  if (defaultValueResourceType) {
    return defaultValueResourceType as ResourceType;
  }

  if (targetTypes.length > 0 && targetTypes[0].type === 'resourceType') {
    return targetTypes[0].resourceType as ResourceType;
  }

  return undefined;
}

function getInitialTargetType(defaultValue: Reference | undefined, targetTypes: TargetType[]): TargetType | undefined {
  const defaultValueResourceType = defaultValue?.reference?.split('/')[0];
  console.log(defaultValue, defaultValueResourceType);
  if (defaultValueResourceType) {
    return (
      targetTypes.find((tt) => tt.resourceType === defaultValueResourceType) ?? {
        type: 'resourceType',
        value: defaultValueResourceType,
        resourceType: defaultValueResourceType as ResourceType,
      }
    );
  }

  if (targetTypes.length > 0) {
    return targetTypes[0];
  }

  return undefined;
}
interface ResourceTypeResponse {
  readonly data: {
    readonly StructureDefinitionList: Pick<StructureDefinition, 'type'>[];
  };
}
async function fetchResourceType(
  medplum: MedplumClient,
  profileUrl: string
): Promise<Pick<StructureDefinition, 'type'> | undefined> {
  const query = `{
      StructureDefinitionList(url: "${profileUrl}", _sort: "_lastUpdated", _count: 1) {
        type
      }
    }`.replace(/\s+/g, ' ');

  const response = (await medplum.graphql(query)) as ResourceTypeResponse;

  return response.data.StructureDefinitionList[0];
}
