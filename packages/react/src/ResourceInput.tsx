import {
  Autocomplete,
  AutocompleteItem,
  Avatar,
  Group,
  Loader,
  MantineColor,
  SelectItemProps,
  Text,
} from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import React, { forwardRef, useState } from 'react';
import { useMedplum } from './MedplumProvider';
import { useResource } from './useResource';

export interface ResourceInputProps<T extends Resource = Resource> {
  readonly resourceType: ResourceType;
  readonly name: string;
  readonly defaultValue?: T | Reference<T>;
  readonly placeholder?: string;
  readonly loadOnFocus?: boolean;
  readonly onChange?: (value: T | undefined) => void;
}

export function ResourceInput<T extends Resource = Resource>(props: ResourceInputProps<T>): JSX.Element {
  const medplum = useMedplum();
  const defaultValue = useResource(props.defaultValue);
  const [value, setValue] = useState<string>(defaultValue ? getDisplayString(defaultValue) : '');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AutocompleteItem[]>([]);

  async function handleChange(val: string): Promise<void> {
    setValue(val);
    setData([]);

    if (val.trim().length === 0) {
      setLoading(false);
    } else {
      setLoading(true);
      const resources = await medplum.searchResources(
        props.resourceType,
        'name=' + encodeURIComponent(val) + '&_count=10'
      );
      setData(resources.map((resource) => ({ value: getDisplayString(resource), resource })));
      setLoading(false);
    }
  }

  function handleSelect(item: AutocompleteItem): void {
    setValue(item.value);
    setData([]);
    if (props.onChange) {
      props.onChange(item.resource);
    }
  }

  return (
    <Autocomplete
      itemComponent={RowComponent}
      value={value}
      data={data}
      placeholder={props.placeholder}
      onChange={handleChange}
      onItemSubmit={handleSelect}
      rightSection={loading ? <Loader size={16} /> : null}
    />
  );
}

interface ItemProps extends SelectItemProps {
  color: MantineColor;
  description: string;
  image: string;
}

const RowComponent = forwardRef<HTMLDivElement, ItemProps>(
  ({ description, value, image, ...others }: ItemProps, ref) => (
    <div ref={ref} {...others}>
      <Group noWrap>
        <Avatar src={image} />
        <div>
          <Text>{value}</Text>
          <Text size="xs" color="dimmed">
            {description}
          </Text>
        </div>
      </Group>
    </div>
  )
);
