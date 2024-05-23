import { NativeSelect, TextInput } from '@mantine/core';
import { Money } from '@medplum/fhirtypes';
import { IconCurrencyDollar } from '@tabler/icons-react';
import { ChangeEvent, useCallback, useContext, useMemo, useState } from 'react';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

/*
 * Based on: https://github.com/mantinedev/ui.mantine.dev/blob/master/components/CurrencyInput/CurrencyInput.tsx
 */

/**
 * List of currencies.
 *
 * Full list of currencies:
 * https://www.hl7.org/fhir/valueset-currencies.html
 *
 * Latest browsers can report list of supported currencies, but it's not widely supported:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/supportedValuesOf
 *
 * Using a short list for simplicity for now.
 */
const data = ['USD', 'EUR', 'CAD', 'GBP', 'AUD'];

export interface MoneyInputProps extends ComplexTypeInputProps<Money> {
  readonly label?: string;
  readonly placeholder?: string;
}

export function MoneyInput(props: MoneyInputProps): JSX.Element {
  const { onChange } = props;
  const [value, setValue] = useState(props.defaultValue);
  const { getExtendedProps } = useContext(ElementsContext);
  const [currencyProps, valueProps] = useMemo(
    () => ['currency', 'value'].map((field) => getExtendedProps(props.path + '.' + field)),
    [getExtendedProps, props.path]
  );

  const setValueWrapper = useCallback(
    (newValue: Money): void => {
      setValue(newValue);
      if (onChange) {
        onChange(newValue);
      }
    },
    [onChange]
  );

  const handleCurrencyChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      setValueWrapper({
        ...value,
        currency: e.currentTarget.value,
      });
    },
    [value, setValueWrapper]
  );

  const handleValueChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setValueWrapper({
        ...value,
        value: e.currentTarget.valueAsNumber,
      });
    },
    [value, setValueWrapper]
  );

  const select = (
    <NativeSelect
      disabled={props.disabled || currencyProps?.readonly}
      defaultValue={value?.currency}
      data={data}
      styles={{
        input: {
          fontWeight: 500,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          width: 92,
        },
      }}
      onChange={handleCurrencyChange}
    />
  );

  return (
    <TextInput
      disabled={props.disabled || valueProps?.readonly}
      type="number"
      name={props.name}
      label={props.label}
      placeholder={props.placeholder ?? 'Value'}
      defaultValue={value?.value?.toString() ?? 'USD'}
      leftSection={<IconCurrencyDollar size={14} />}
      rightSection={select}
      rightSectionWidth={92}
      onChange={handleValueChange}
    />
  );
}
