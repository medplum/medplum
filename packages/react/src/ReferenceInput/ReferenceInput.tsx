import { Group, NativeSelect } from '@mantine/core';
import { MedplumClient, createReference, isEmpty } from '@medplum/core';
import { Reference, Resource, ResourceType, StructureDefinition } from '@medplum/fhirtypes';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

type TargetType =
  | {
      type: 'resourceType';
      value: string;
      resourceType: string;
    }
  | {
      type: 'profile';
      value: string;
      resourceType?: string;
    };

export function ReferenceInput(props: ReferenceInputProps): JSX.Element {
  const medplum = useMedplum();
  const [targetTypes, setTargetTypes] = useState<TargetType[]>(() => createTargetTypes(props.targetTypes));
  const [value, setValue] = useState<Reference | undefined>(props.defaultValue);
  const [targetType, setTargetType] = useState<TargetType | undefined>(() =>
    getInitialTargetType(props.defaultValue, targetTypes)
  );
  const [resourceType, setResourceType] = useState<ResourceType | undefined>();

  const searchCriteria = useMemo<ReferenceInputProps['searchCriteria']>(() => {
    if (targetType?.type === 'profile') {
      return { ...props.searchCriteria, _profile: targetType.value };
    }
    return props.searchCriteria;
  }, [props.searchCriteria, targetType]);

  useEffect(() => {
    // const typesToFetch = targetTypes.filter((tt) => isEmpty(tt.resourceType));

    // if (typesToFetch)
    const promises: Promise<TargetType>[] = [];
    let didFetch: boolean = false;
    for (const tt of targetTypes) {
      if (tt.type === 'profile' && isEmpty(tt.resourceType)) {
        const promise = fetchResourceType(medplum, tt.value)
          .then((partialSD) => {
            if (!partialSD) {
              console.debug(`StructureDefinition for ${tt.value} not found`);
              return tt;
            }

            if (partialSD.type) {
              return { ...tt, resourceType: partialSD.type satisfies string };
            }

            console.debug(`resourceType for ${tt.value} unexpectedly missing`);
            return tt;
          })
          .catch((reason) => {
            console.error(reason);
            return tt;
          });
        promises.push(promise);
        didFetch ||= true;
      } else {
        promises.push(Promise.resolve(tt));
      }
    }

    if (didFetch) {
      Promise.all(promises)
        .then((newTargetTypes) => {
          setTargetTypes(newTargetTypes);
          if (targetType?.resourceType) {
            const needle = targetType.resourceType satisfies string;
            // assumes newTargetTypes has no duplicate resourceType entries which technically
            // might not be the case if multiple profiles on the same resource type are included
            const index = newTargetTypes.findIndex((tt) => tt.resourceType === needle);
            if (index >= 0) {
              // orphaned targetType has been resolved
              setTargetType(newTargetTypes[index]);
            } else {
              console.log(`defaultValue had unexpected resourceType: ${targetType.resourceType}`);
            }
          }
        })
        .catch(console.error);
    }
  }, [medplum, targetType, targetTypes]);

  useEffect(() => {
    if (targetType?.resourceType !== resourceType) {
      setResourceType(targetType?.resourceType as ResourceType);
    }
  }, [resourceType, targetType?.resourceType]);

  const setValueHelper = useCallback(
    (item: Resource | undefined) => {
      const newValue = item ? createReference(item) : undefined;
      setValue(newValue);
      if (props.onChange) {
        props.onChange(newValue);
      }
    },
    // exhaustive deps wants this to be [props] instead of [props.onChange], but it's
    // unclear why.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.onChange]
  );

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
            // TODO: handle case where nativeselect is shown for multiple types including a profile
            setTargetType(targetTypes.find((tt) => tt.value === newValue));
            setResourceType(newValue as ResourceType);
          }}
          data={targetTypes.map((tt) => tt.value)}
        />
      )}
      {targetTypes.length === 0 && (
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
        onChange={setValueHelper}
      />
    </Group>
  );
}

function createTargetTypes(resourceTypesAndProfileUrls: string[] | undefined): TargetType[] {
  const results: TargetType[] = [];
  if (
    !resourceTypesAndProfileUrls ||
    resourceTypesAndProfileUrls.length === 0 ||
    (resourceTypesAndProfileUrls.length === 1 && resourceTypesAndProfileUrls[0] === 'Resource')
  ) {
    return results;
  }

  for (const value of resourceTypesAndProfileUrls) {
    // TODO is there a less hacky way to distinguish resourceType from URLs?
    if (value.includes('/')) {
      results.push({ type: 'profile', value });
    } else {
      results.push({ type: 'resourceType', value, resourceType: value });
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

    // An "orphaned" TargetType is created when defaultValue references a resourceType
    // that is not yet represented in targetTypes due to profile URL resolution to resource type
    // that has yet to occur
    const orphan: TargetType = {
      type: 'resourceType',
      value: defaultValueResourceType,
      resourceType: defaultValueResourceType,
    };
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
