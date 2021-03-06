import { Bundle, BundleEntry, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import React, { useEffect, useRef, useState } from 'react';
import { Autocomplete } from './Autocomplete';
import { Avatar } from './Avatar';
import { useMedplum } from './MedplumProvider';
import { ResourceName } from './ResourceName';
import { useResource } from './useResource';

export interface ResourceInputProps<T extends Resource = Resource> {
  readonly resourceType: string;
  readonly name: string;
  readonly defaultValue?: T | Reference<T>;
  readonly className?: string;
  readonly placeholder?: string;
  readonly loadOnFocus?: boolean;
  readonly onChange?: (value: T | undefined) => void;
}

export function ResourceInput<T extends Resource = Resource>(props: ResourceInputProps<T>): JSX.Element {
  const medplum = useMedplum();
  const defaultResource = useResource(props.defaultValue);
  const [value, setValue] = useState<T>();

  const resourceTypeRef = useRef<string>(props.resourceType);
  resourceTypeRef.current = props.resourceType;

  useEffect(() => {
    setValue(defaultResource);
  }, [defaultResource]);

  function setValueWrapper(newValue: T | undefined): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Autocomplete
      loadOptions={async (input: string): Promise<T[]> => {
        return medplum
          .search(resourceTypeRef.current as ResourceType, 'name=' + encodeURIComponent(input) + '&_count=10')
          .then((bundle: Bundle) => (bundle.entry as BundleEntry[]).map((entry) => entry.resource as T));
      }}
      getId={(item: T) => {
        return item.id as string;
      }}
      getIcon={(item: T) => <Avatar value={item} />}
      getDisplay={(item: T) => <ResourceName value={item} />}
      getHelpText={(item: T) => {
        if (item.resourceType === 'Patient' && item.birthDate) {
          return 'DoB: ' + item.birthDate;
        }
        return undefined;
      }}
      name={props.name}
      defaultValue={value ? [value] : undefined}
      className={props.className}
      placeholder={props.placeholder}
      loadOnFocus={props.loadOnFocus}
      onChange={(items: T[]) => {
        setValueWrapper(items.length > 0 ? items[0] : undefined);
      }}
    />
  );
}
