import { Group, NativeSelect } from '@mantine/core';
import { MedplumClient, createReference, isEmpty, tryGetProfile } from '@medplum/core';
import { Reference, Resource, ResourceType, StructureDefinition } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ResourceInput } from '../ResourceInput/ResourceInput';
import { ResourceTypeInput } from '../ResourceTypeInput/ResourceTypeInput';

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

interface BaseTargetType {
  value: string;
}

type ProfileTargetType = BaseTargetType & {
  type: 'profile';
  name?: string;
  title?: string;
  resourceType?: string;
  error?: any;
};

type ResourceTypeTargetType = BaseTargetType & {
  type: 'resourceType';
  resourceType: string;
};
type TargetType = ResourceTypeTargetType | ProfileTargetType;

export function ReferenceInput(props: ReferenceInputProps): JSX.Element {
  const medplum = useMedplum();
  const [value, setValue] = useState<Reference | undefined>(props.defaultValue);
  const [targetTypes, setTargetTypes] = useState<TargetType[] | undefined>(() => createTargetTypes(props.targetTypes));
  const [state, setState] = useState<{
    targetType?: TargetType;
    resourceType?: ResourceType;
  }>(() => {
    const targetType = getInitialTargetType(props.defaultValue, targetTypes);
    return { targetType, resourceType: targetType?.resourceType as ResourceType };
  });

  const searchCriteria = useMemo<ReferenceInputProps['searchCriteria']>(() => {
    if (state.targetType?.type === 'profile') {
      return { ...props.searchCriteria, _profile: state.targetType.value };
    }
    return props.searchCriteria;
  }, [props.searchCriteria, state.targetType]);

  useEffect(() => {
    if (!targetTypes) {
      return;
    }

    if (targetTypes.filter(shouldFetchResourceType).length === 0) {
      return;
    }

    const newTargetTypePromises: Promise<TargetType>[] = targetTypes.map((tt) => {
      if (shouldFetchResourceType(tt)) {
        return fetchResourceTypeOfProfile(medplum, tt.value)
          .then((profile) => {
            const newTargetType = { ...tt };

            if (!profile) {
              console.debug(`StructureDefinition for ${tt.value} not found`);
              newTargetType.error = 'StructureDefinition not found';
            } else if (!profile.type || isEmpty(profile.type)) {
              console.debug(`resourceType for ${tt.value} unexpectedly missing`);
              newTargetType.error = 'resourceType unavailable';
            } else {
              newTargetType.resourceType = profile.type satisfies string;
              newTargetType.name = profile.name;
              newTargetType.title = profile.title;
            }

            return newTargetType;
          })
          .catch((reason) => {
            console.error(reason);
            return { ...tt, error: reason };
          });
      } else {
        return Promise.resolve(tt);
      }
    });

    Promise.all(newTargetTypePromises)
      .then((newTargetTypes) => {
        setTargetTypes(newTargetTypes);
        if (state.targetType) {
          const needle: string = state.targetType.value;
          const index = newTargetTypes.findIndex((tt) => tt.value === needle);
          if (index >= 0) {
            // orphaned targetType has been resolved
            setState({
              ...state,
              targetType: newTargetTypes[index],
              resourceType: newTargetTypes[index].resourceType as ResourceType,
            });
          } else {
            console.log(`defaultValue had unexpected resourceType: ${state.targetType.resourceType}`);
          }
        }
      })
      .catch(console.error);
  }, [medplum, state, state.targetType, targetTypes]);

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

  const typeSelectOptions = useMemo(() => {
    if (targetTypes) {
      return targetTypes.map((tt) => {
        return {
          value: tt.value,
          label: tt.type === 'profile' ? tt.title ?? tt.name ?? tt.resourceType ?? tt.value : tt.value,
        };
      });
    }
    return [];
  }, [targetTypes]);

  return (
    <Group spacing="xs" grow noWrap>
      {targetTypes && targetTypes.length > 1 && (
        <NativeSelect
          data-autofocus={props.autoFocus}
          data-testid="reference-input-resource-type-select"
          defaultValue={state.resourceType}
          autoFocus={props.autoFocus}
          onChange={(e) => {
            const newValue = e.currentTarget.value;
            const newTargetType = targetTypes.find((tt) => tt.value === newValue);
            setState({
              targetType: newTargetType,
              resourceType: newTargetType?.resourceType as ResourceType,
            });
          }}
          data={typeSelectOptions}
        />
      )}
      {!targetTypes && (
        <ResourceTypeInput
          autoFocus={props.autoFocus}
          testId="reference-input-resource-type-input"
          defaultValue={state.resourceType}
          onChange={(newResourceType) => {
            setState({ ...state, resourceType: newResourceType });
          }}
          name={props.name + '-resourceType'}
          placeholder="Resource Type"
        />
      )}
      <ResourceInput
        resourceType={state.resourceType as ResourceType}
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

function createTargetTypes(resourceTypesAndProfileUrls: string[] | undefined): TargetType[] | undefined {
  if (
    !resourceTypesAndProfileUrls ||
    resourceTypesAndProfileUrls.length === 0 ||
    (resourceTypesAndProfileUrls.length === 1 && resourceTypesAndProfileUrls[0] === 'Resource')
  ) {
    return undefined;
  }

  const results: TargetType[] = [];
  for (const value of resourceTypesAndProfileUrls) {
    // is there a less hacky way to distinguish resourceType from profile URLs?
    if (value.includes('/')) {
      results.push({ type: 'profile', value });
    } else {
      results.push({ type: 'resourceType', value, resourceType: value });
    }
  }
  return results;
}

function getInitialTargetType(
  defaultValue: Reference | undefined,
  targetTypes: TargetType[] | undefined
): TargetType | undefined {
  const defaultValueResourceType = defaultValue?.reference?.split('/')[0];
  if (defaultValueResourceType) {
    const targetType = targetTypes?.find((tt) => tt.resourceType === defaultValueResourceType);
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

  if (targetTypes && targetTypes.length > 0) {
    return targetTypes[0];
  }

  return undefined;
}

type PartialStructureDefinition = Pick<StructureDefinition, 'type' | 'name' | 'title'>;

interface ResourceTypeGraphQLResponse {
  readonly data: {
    readonly StructureDefinitionList: PartialStructureDefinition[];
  };
}

async function fetchResourceTypeOfProfile(
  medplum: MedplumClient,
  profileUrl: string
): Promise<PartialStructureDefinition | undefined> {
  const profile = tryGetProfile(profileUrl);
  if (profile) {
    return { type: profile.type, name: profile.name, title: profile.title };
  }

  // TODO{profiles}: centralize _sort for profiles
  const query = `{
      StructureDefinitionList(url: "${profileUrl}", _sort: "_lastUpdated", _count: 1) {
        type,
        name,
        title,
      }
    }`.replace(/\s+/g, ' ');

  const response = (await medplum.graphql(query)) as ResourceTypeGraphQLResponse;

  return response.data.StructureDefinitionList[0];
}

function shouldFetchResourceType(targetType: TargetType): targetType is ProfileTargetType {
  return targetType.type === 'profile' && !targetType?.error && isEmpty(targetType.resourceType);
}
