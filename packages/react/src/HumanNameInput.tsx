import { Group, NativeSelect, TextInput } from '@mantine/core';
import { HumanName } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';

export interface HumanNameInputProps {
  name: string;
  defaultValue?: HumanName;
  onChange?: (value: HumanName) => void;
}

export function HumanNameInput(props: HumanNameInputProps): JSX.Element {
  const [value, setValue] = useState<HumanName | undefined>(props.defaultValue);

  const valueRef = useRef<HumanName>();
  valueRef.current = value;

  function setValueWrapper(newValue: HumanName): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  function setUse(use: 'temp' | 'old' | 'usual' | 'official' | 'nickname' | 'anonymous' | 'maiden' | undefined): void {
    setValueWrapper({ ...valueRef.current, use: use ? use : undefined });
  }

  function setPrefix(prefix: string): void {
    setValueWrapper({
      ...valueRef.current,
      prefix: prefix ? prefix.split(' ') : undefined,
    });
  }

  function setGiven(given: string): void {
    setValueWrapper({
      ...valueRef.current,
      given: given ? given.split(' ') : undefined,
    });
  }

  function setFamily(family: string): void {
    setValueWrapper({
      ...valueRef.current,
      family: family ? family : undefined,
    });
  }

  function setSuffix(suffix: string): void {
    setValueWrapper({
      ...valueRef.current,
      suffix: suffix ? suffix.split(' ') : undefined,
    });
  }

  return (
    <Group spacing="xs" grow noWrap>
      <NativeSelect
        defaultValue={value?.use}
        data-testid="use"
        onChange={(e) =>
          setUse(e.currentTarget.value as 'temp' | 'old' | 'usual' | 'official' | 'nickname' | 'anonymous' | 'maiden')
        }
        data={['', 'temp', 'old', 'usual', 'official', 'nickname', 'anonymous', 'maiden']}
      />
      <TextInput
        placeholder="Prefix"
        defaultValue={value?.prefix?.join(' ')}
        onChange={(e) => setPrefix(e.currentTarget.value)}
      />
      <TextInput
        placeholder="Given"
        defaultValue={value?.given?.join(' ')}
        onChange={(e) => setGiven(e.currentTarget.value)}
      />
      <TextInput placeholder="Family" defaultValue={value?.family} onChange={(e) => setFamily(e.currentTarget.value)} />
      <TextInput
        placeholder="Suffix"
        defaultValue={value?.suffix?.join(' ')}
        onChange={(e) => setSuffix(e.currentTarget.value)}
      />
    </Group>
  );
}
