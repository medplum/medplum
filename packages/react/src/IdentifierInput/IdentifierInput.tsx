import { Group, TextInput } from '@mantine/core';
import { Identifier } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { getErrorsForInput } from '../utils/outcomes';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

export type IdentifierInputProps = ComplexTypeInputProps<Identifier>;

export function IdentifierInput(props: IdentifierInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);
  const { elementsByPath, getExtendedProps } = useContext(ElementsContext);

  const [systemElement, valueElement] = useMemo(
    () => ['system', 'value'].map((field) => elementsByPath[props.path + '.' + field]),
    [elementsByPath, props.path]
  );

  const [systemProps, valueProps] = useMemo(
    () => ['system', 'value'].map((field) => getExtendedProps(props.path + '.' + field)),
    [getExtendedProps, props.path]
  );

  function setValueWrapper(newValue: Identifier): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }
  const errorPath: string = props.valuePath ?? props.path;

  return (
    <Group gap="xs" grow wrap="nowrap" align="flex-start">
      <TextInput
        disabled={props.disabled || systemProps?.readonly}
        placeholder="System"
        required={(systemElement?.min ?? 0) > 0}
        defaultValue={value?.system}
        onChange={(e) => setValueWrapper({ ...value, system: e.currentTarget.value })}
        error={getErrorsForInput(props.outcome, errorPath + '.system')}
      />
      <TextInput
        disabled={props.disabled || valueProps?.readonly}
        placeholder="Value"
        required={(valueElement?.min ?? 0) > 0}
        defaultValue={value?.value}
        onChange={(e) => setValueWrapper({ ...value, value: e.currentTarget.value })}
        error={getErrorsForInput(props.outcome, errorPath + '.value')}
      />
    </Group>
  );
}
