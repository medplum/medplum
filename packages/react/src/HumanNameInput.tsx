import { HumanName } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { Input } from './Input';
import { InputRow } from './InputRow';
import { Select } from './Select';

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

  function setUse(use: string): void {
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
    <InputRow>
      <Select defaultValue={value?.use} onChange={setUse} testid="use">
        <option></option>
        <option>usual</option>
        <option>official</option>
        <option>temp</option>
        <option>nickname</option>
        <option>anonymous</option>
        <option>old</option>
        <option>maiden</option>
      </Select>
      <Input placeholder="Prefix" defaultValue={value?.prefix?.join(' ')} onChange={setPrefix} />
      <Input placeholder="Given" defaultValue={value?.given?.join(' ')} onChange={setGiven} />
      <Input placeholder="Family" defaultValue={value?.family} onChange={setFamily} />
      <Input placeholder="Suffix" defaultValue={value?.suffix?.join(' ')} onChange={setSuffix} />
    </InputRow>
  );
}
