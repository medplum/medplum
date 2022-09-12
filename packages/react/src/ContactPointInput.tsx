import { ContactPoint } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { Input } from './Input';
import { InputRow } from './InputRow';
import { Select } from './Select';

export interface ContactPointInputProps {
  name: string;
  defaultValue?: ContactPoint;
  onChange?: (value: ContactPoint | undefined) => void;
}

export function ContactPointInput(props: ContactPointInputProps): JSX.Element {
  const [contactPoint, setContactPoint] = useState(props.defaultValue);

  const ref = useRef<ContactPoint>();
  ref.current = contactPoint;

  function setContactPointWrapper(newValue: ContactPoint | undefined): void {
    if (newValue && Object.keys(newValue).length === 0) {
      newValue = undefined;
    }
    setContactPoint(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  function setSystem(system: 'url' | 'phone' | 'fax' | 'email' | 'pager' | 'sms' | 'other'): void {
    const newValue: ContactPoint = { ...ref.current, system };
    if (!system) {
      delete newValue.system;
    }
    setContactPointWrapper(newValue);
  }

  function setUse(use: 'home' | 'work' | 'temp' | 'old' | 'mobile'): void {
    const newValue: ContactPoint = { ...ref.current, use };
    if (!use) {
      delete newValue.use;
    }
    setContactPointWrapper(newValue);
  }

  function setValue(value: string): void {
    const newValue: ContactPoint = { ...ref.current, value };
    if (!value) {
      delete newValue.value;
    }
    setContactPointWrapper(newValue);
  }

  return (
    <InputRow>
      <Select defaultValue={contactPoint?.system} onChange={setSystem as (system: string) => void} testid="system">
        <option></option>
        <option>email</option>
        <option>fax</option>
        <option>pager</option>
        <option>phone</option>
        <option>other</option>
        <option>sms</option>
        <option>url</option>
      </Select>
      <Select defaultValue={contactPoint?.use} onChange={setUse as (use: string) => void} testid="use">
        <option></option>
        <option>home</option>
        <option>mobile</option>
        <option>old</option>
        <option>temp</option>
        <option>work</option>
      </Select>
      <Input placeholder="Value" defaultValue={contactPoint?.value} onChange={setValue} />
    </InputRow>
  );
}
