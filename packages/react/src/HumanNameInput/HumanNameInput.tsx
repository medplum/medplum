import { Group, NativeSelect, TextInput } from '@mantine/core';
import { HumanName } from '@medplum/fhirtypes';
import { useState } from 'react';
import { getErrorsForInput } from '../utils/outcomes';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

export type HumanNameInputProps = ComplexTypeInputProps<HumanName>;

export function HumanNameInput(props: HumanNameInputProps): JSX.Element {
  const { outcome, path } = props;
  const [value, setValue] = useState<HumanName | undefined>(props.defaultValue);

  function setValueWrapper(newValue: HumanName): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  function setUse(use: 'temp' | 'old' | 'usual' | 'official' | 'nickname' | 'anonymous' | 'maiden' | undefined): void {
    setValueWrapper({ ...value, use: use || undefined });
  }

  function setPrefix(prefix: string): void {
    setValueWrapper({
      ...value,
      prefix: prefix ? prefix.split(' ') : undefined,
    });
  }

  function setGiven(given: string): void {
    setValueWrapper({
      ...value,
      given: given ? given.split(' ') : undefined,
    });
  }

  function setFamily(family: string): void {
    setValueWrapper({
      ...value,
      family: family || undefined,
    });
  }

  function setSuffix(suffix: string): void {
    setValueWrapper({
      ...value,
      suffix: suffix ? suffix.split(' ') : undefined,
    });
  }

  return (
    <Group spacing="xs" grow noWrap>
      <NativeSelect
        defaultValue={value?.use}
        name={props.name + '-use'}
        data-testid="use"
        onChange={(e) =>
          setUse(e.currentTarget.value as 'temp' | 'old' | 'usual' | 'official' | 'nickname' | 'anonymous' | 'maiden')
        }
        data={['', 'temp', 'old', 'usual', 'official', 'nickname', 'anonymous', 'maiden']}
        error={getErrorsForInput(outcome, path + '.use')}
      />
      <TextInput
        placeholder="Prefix"
        name={props.name + '-prefix'}
        defaultValue={value?.prefix?.join(' ')}
        onChange={(e) => setPrefix(e.currentTarget.value)}
        error={getErrorsForInput(outcome, path + '.prefix')}
      />
      <TextInput
        placeholder="Given"
        name={props.name + '-given'}
        defaultValue={value?.given?.join(' ')}
        onChange={(e) => setGiven(e.currentTarget.value)}
        error={getErrorsForInput(outcome, path + '.given')}
      />
      <TextInput
        name={props.name + '-family'}
        placeholder="Family"
        defaultValue={value?.family}
        onChange={(e) => setFamily(e.currentTarget.value)}
        error={getErrorsForInput(outcome, path + '.family')}
      />
      <TextInput
        placeholder="Suffix"
        name={props.name + '-suffix'}
        defaultValue={value?.suffix?.join(' ')}
        onChange={(e) => setSuffix(e.currentTarget.value)}
        error={getErrorsForInput(outcome, path + '.suffix')}
      />
    </Group>
  );
}
