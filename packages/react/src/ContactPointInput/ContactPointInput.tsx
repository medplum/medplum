import { Group, NativeSelect, TextInput } from '@mantine/core';
import { ContactPoint } from '@medplum/fhirtypes';
import { useContext, useMemo, useRef, useState } from 'react';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { getErrorsForInput } from '../utils/outcomes';

export type ContactPointInputProps = ComplexTypeInputProps<ContactPoint> & {
  readonly onChange?: (value: ContactPoint | undefined) => void;
};

export function ContactPointInput(props: ContactPointInputProps): JSX.Element {
  const { path, outcome } = props;
  const { elementsByPath, getExtendedProps } = useContext(ElementsContext);
  const [contactPoint, setContactPoint] = useState(props.defaultValue);

  const ref = useRef<ContactPoint>();
  ref.current = contactPoint;

  const [systemElement, useElement, valueElement] = useMemo(
    () => ['system', 'use', 'value'].map((field) => elementsByPath[path + '.' + field]),
    [elementsByPath, path]
  );
  const [systemProps, useProps, valueProps] = useMemo(
    () => ['system', 'use', 'value'].map((field) => getExtendedProps(path + '.' + field)),
    [getExtendedProps, path]
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

  const errorPath = props.valuePath ?? path;

  return (
    <Group gap="xs" grow wrap="nowrap" align="flex-start">
      <NativeSelect
        disabled={props.disabled || systemProps?.readonly}
        data-testid="system"
        defaultValue={contactPoint?.system}
        required={(systemElement?.min ?? 0) > 0}
        onChange={(e) =>
          setSystem(e.currentTarget.value as 'url' | 'phone' | 'fax' | 'email' | 'pager' | 'sms' | 'other')
        }
        data={['', 'email', 'phone', 'fax', 'pager', 'sms', 'other']}
        error={getErrorsForInput(outcome, errorPath + '.system')}
      />
      <NativeSelect
        disabled={props.disabled || useProps?.readonly}
        data-testid="use"
        defaultValue={contactPoint?.use}
        required={(useElement?.min ?? 0) > 0}
        onChange={(e) => setUse(e.currentTarget.value as 'home' | 'work' | 'temp' | 'old' | 'mobile')}
        data={['', 'home', 'work', 'temp', 'old', 'mobile']}
        error={getErrorsForInput(outcome, errorPath + '.use')}
      />
      <TextInput
        disabled={props.disabled || valueProps?.readonly}
        placeholder="Value"
        defaultValue={contactPoint?.value}
        required={(valueElement?.min ?? 0) > 0}
        onChange={(e) => setValue(e.currentTarget.value)}
        error={getErrorsForInput(outcome, errorPath + '.value')}
      />
    </Group>
  );
}
