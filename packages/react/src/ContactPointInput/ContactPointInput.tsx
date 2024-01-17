import { Group, NativeSelect, TextInput } from '@mantine/core';
import { ContactPoint } from '@medplum/fhirtypes';
import { useContext, useMemo, useRef, useState } from 'react';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { BackboneElementContext } from '../BackboneElementInput/BackboneElementInput.utils';
import { getErrorsForInput } from '../utils/outcomes';

export type ContactPointInputProps = ComplexTypeInputProps<ContactPoint> & {
  onChange: ((value: ContactPoint | undefined) => void) | undefined;
};

export function ContactPointInput(props: ContactPointInputProps): JSX.Element {
  const { path, outcome } = props;
  const { getModifiedNestedElement } = useContext(BackboneElementContext);
  const [contactPoint, setContactPoint] = useState(props.defaultValue);

  const ref = useRef<ContactPoint>();
  ref.current = contactPoint;

  const [systemElement, useElement, valueElement] = useMemo(
    () => ['system', 'use', 'value'].map((field) => getModifiedNestedElement(path + '.' + field)),
    [getModifiedNestedElement, path]
  );

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
    <Group gap="xs" grow wrap="nowrap" align="flex-start">
      <NativeSelect
        data-testid="system"
        defaultValue={contactPoint?.system}
        required={(systemElement?.min ?? 0) > 0}
        onChange={(e) =>
          setSystem(e.currentTarget.value as 'url' | 'phone' | 'fax' | 'email' | 'pager' | 'sms' | 'other')
        }
        data={['', 'email', 'phone', 'fax', 'pager', 'sms', 'other']}
        error={getErrorsForInput(outcome, path + '.system')}
      />
      <NativeSelect
        data-testid="use"
        defaultValue={contactPoint?.use}
        required={(useElement?.min ?? 0) > 0}
        onChange={(e) => setUse(e.currentTarget.value as 'home' | 'work' | 'temp' | 'old' | 'mobile')}
        data={['', 'home', 'work', 'temp', 'old', 'mobile']}
        error={getErrorsForInput(outcome, path + '.use')}
      />
      <TextInput
        placeholder="Value"
        defaultValue={contactPoint?.value}
        required={(valueElement?.min ?? 0) > 0}
        onChange={(e) => setValue(e.currentTarget.value)}
        error={getErrorsForInput(outcome, path + '.value')}
      />
    </Group>
  );
}
