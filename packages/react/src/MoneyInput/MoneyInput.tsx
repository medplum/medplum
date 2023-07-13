import { NativeSelect, TextInput } from '@mantine/core';
import { Money } from '@medplum/fhirtypes';
import { IconCurrencyDollar } from '@tabler/icons-react';
import React, { useCallback, useState } from 'react';

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

export interface MoneyInputProps {
  name: string;
  label?: string;
  placeholder?: string;
  defaultValue?: Money;
  onChange?: (value: Money) => void;
}

export function MoneyInput(props: MoneyInputProps): JSX.Element {
  const { onChange } = props;
  const [value, setValue] = useState(props.defaultValue);

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
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setValueWrapper({
        ...value,
        currency: e.currentTarget.value,
      });
    },
    [value, setValueWrapper]
  );

  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValueWrapper({
        ...value,
        value: e.currentTarget.valueAsNumber,
      });
    },
    [value, setValueWrapper]
  );

  const select = (
    <NativeSelect
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
      type="number"
      label={props.label}
      placeholder={props.placeholder ?? 'Value'}
      defaultValue={value?.value?.toString() ?? 'USD'}
      icon={<IconCurrencyDollar size={14} />}
      rightSection={select}
      rightSectionWidth={92}
      onChange={handleValueChange}
    />
  );
}
