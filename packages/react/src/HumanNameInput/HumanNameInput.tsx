import { Group, NativeSelect, TextInput } from '@mantine/core';
import { HumanName } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { getErrorsForInput } from '../utils/outcomes';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';

export type HumanNameInputProps = ComplexTypeInputProps<HumanName>;

export function HumanNameInput(props: HumanNameInputProps): JSX.Element {
  const { outcome, path } = props;
  const [value, setValue] = useState<HumanName | undefined>(props.defaultValue);
  const { getExtendedProps } = useContext(ElementsContext);
  const [useProps, prefixProps, givenProps, familyProps, suffixProps] = useMemo(
    () => ['use', 'prefix', 'given', 'family', 'suffix'].map((field) => getExtendedProps(props.path + '.' + field)),
    [getExtendedProps, props.path]
  );

  function setValueWrapper(newValue: HumanName): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  function setUse(use: 'temp' | 'old' | 'usual' | 'official' | 'nickname' | 'anonymous' | 'maiden' | undefined): void {
    // || instead of ?? to handle empty strings
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
      // || instead of ?? to handle empty strings
      family: family || undefined,
    });
  }

  function setSuffix(suffix: string): void {
    setValueWrapper({
      ...value,
      suffix: suffix ? suffix.split(' ') : undefined,
    });
  }

  const errorPath = props.valuePath ?? path;

  return (
    <Group gap="xs" grow wrap="nowrap">
      <NativeSelect
        disabled={props.disabled || useProps?.readonly}
        defaultValue={value?.use}
        name={props.name + '-use'}
        data-testid="use"
        onChange={(e) =>
          setUse(e.currentTarget.value as 'temp' | 'old' | 'usual' | 'official' | 'nickname' | 'anonymous' | 'maiden')
        }
        data={['', 'temp', 'old', 'usual', 'official', 'nickname', 'anonymous', 'maiden']}
        error={getErrorsForInput(outcome, errorPath + '.use')}
      />
      <TextInput
        disabled={props.disabled || prefixProps?.readonly}
        placeholder="Prefix"
        name={props.name + '-prefix'}
        defaultValue={value?.prefix?.join(' ')}
        onChange={(e) => setPrefix(e.currentTarget.value)}
        error={getErrorsForInput(outcome, errorPath + '.prefix')}
      />
      <TextInput
        disabled={props.disabled || givenProps?.readonly}
        placeholder="Given"
        name={props.name + '-given'}
        defaultValue={value?.given?.join(' ')}
        onChange={(e) => setGiven(e.currentTarget.value)}
        error={getErrorsForInput(outcome, errorPath + '.given')}
      />
      <TextInput
        disabled={props.disabled || familyProps?.readonly}
        name={props.name + '-family'}
        placeholder="Family"
        defaultValue={value?.family}
        onChange={(e) => setFamily(e.currentTarget.value)}
        error={getErrorsForInput(outcome, errorPath + '.family')}
      />
      <TextInput
        disabled={props.disabled || suffixProps?.readonly}
        placeholder="Suffix"
        name={props.name + '-suffix'}
        defaultValue={value?.suffix?.join(' ')}
        onChange={(e) => setSuffix(e.currentTarget.value)}
        error={getErrorsForInput(outcome, errorPath + '.suffix')}
      />
    </Group>
  );
}
