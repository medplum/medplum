import { Group, NativeSelect, TextInput } from '@mantine/core';
import { ContactPoint } from '@medplum/fhirtypes';
import { useRef, useState } from 'react';

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
    <Group spacing="xs" grow noWrap>
      <NativeSelect
        data-testid="system"
        defaultValue={contactPoint?.system}
        onChange={(e) =>
          setSystem(e.currentTarget.value as 'url' | 'phone' | 'fax' | 'email' | 'pager' | 'sms' | 'other')
        }
        data={['', 'email', 'phone', 'fax', 'pager', 'sms', 'other']}
      />
      <NativeSelect
        data-testid="use"
        defaultValue={contactPoint?.use}
        onChange={(e) => setUse(e.currentTarget.value as 'home' | 'work' | 'temp' | 'old' | 'mobile')}
        data={['', 'home', 'work', 'temp', 'old', 'mobile']}
      />
      <TextInput
        placeholder="Value"
        defaultValue={contactPoint?.value}
        onChange={(e) => setValue(e.currentTarget.value)}
      />
    </Group>
  );
}
