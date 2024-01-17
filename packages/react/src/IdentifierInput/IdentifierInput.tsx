import { Group, TextInput } from '@mantine/core';
import { Identifier } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { getErrorsForInput } from '../utils/outcomes';
import { BackboneElementContext } from '../BackboneElementInput/BackboneElementInput.utils';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

export type IdentifierInputProps = ComplexTypeInputProps<Identifier>;

export function IdentifierInput(props: IdentifierInputProps): JSX.Element {
  const { path, outcome } = props;
  const [value, setValue] = useState(props.defaultValue);
  const { getModifiedNestedElement } = useContext(BackboneElementContext);

  const [systemElement, valueElement] = useMemo(
    () => ['system', 'value'].map((field) => getModifiedNestedElement(path + '.' + field)),
    [getModifiedNestedElement, path]
  );

  function setValueWrapper(newValue: Identifier): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Group gap="xs" grow wrap="nowrap" align="flex-start">
      <TextInput
        placeholder="System"
        required={(systemElement?.min ?? 0) > 0}
        defaultValue={value?.system}
        onChange={(e) => setValueWrapper({ ...value, system: e.currentTarget.value })}
        error={getErrorsForInput(outcome, path + '.system')}
      />
      <TextInput
        placeholder="Value"
        required={(valueElement?.min ?? 0) > 0}
        defaultValue={value?.value}
        onChange={(e) => setValueWrapper({ ...value, value: e.currentTarget.value })}
        error={getErrorsForInput(outcome, path + '.value')}
      />
    </Group>
  );
}
