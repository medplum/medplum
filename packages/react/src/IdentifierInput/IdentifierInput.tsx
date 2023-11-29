import { Group, TextInput } from '@mantine/core';
import { Identifier } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { getErrorsForInput } from '../utils/outcomes';
import { BackboneElementContext } from '../BackboneElementInput/BackbonElementInput.utils';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

type IdentifierInputProps = ComplexTypeInputProps<Identifier>;

export function IdentifierInput(props: IdentifierInputProps): JSX.Element {
  const { property, outcome } = props;
  const [value, setValue] = useState(props.defaultValue);
  const { getNestedElement } = useContext(BackboneElementContext);

  const [systemElement, valueElement] = useMemo(
    () => ['system', 'value'].map((field) => getNestedElement(property, field)),
    [getNestedElement, property]
  );

  function setValueWrapper(newValue: Identifier): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Group spacing="xs" grow noWrap align="flex-start">
      <TextInput
        placeholder="System"
        required={(systemElement?.min ?? 0) > 0}
        defaultValue={value?.system}
        onChange={(e) => setValueWrapper({ ...value, system: e.currentTarget.value })}
        error={getErrorsForInput(outcome, property.path + '.system')}
      />
      <TextInput
        placeholder="Value"
        required={(valueElement?.min ?? 0) > 0}
        defaultValue={value?.value}
        onChange={(e) => setValueWrapper({ ...value, value: e.currentTarget.value })}
        error={getErrorsForInput(outcome, property.path + '.value')}
      />
    </Group>
  );
}
