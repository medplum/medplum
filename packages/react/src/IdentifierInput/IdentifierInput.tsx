import { Group, TextInput } from '@mantine/core';
import { Identifier } from '@medplum/fhirtypes';
import { useState } from 'react';

export interface IdentifierInputProps {
  name: string;
  defaultValue?: Identifier;
  onChange?: (value: Identifier) => void;
}

export function IdentifierInput(props: IdentifierInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);

  function setValueWrapper(newValue: Identifier): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Group spacing="xs" grow noWrap>
      <TextInput
        placeholder="System"
        defaultValue={value?.system}
        onChange={(e) => setValueWrapper({ ...value, system: e.currentTarget.value })}
      />
      <TextInput
        placeholder="Value"
        defaultValue={value?.value}
        onChange={(e) => setValueWrapper({ ...value, value: e.currentTarget.value })}
      />
    </Group>
  );
}
