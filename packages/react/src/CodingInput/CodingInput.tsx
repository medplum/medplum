import { Coding, QuestionnaireResponseItem, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { JSX, useState } from 'react';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { ValueSetAutocomplete, ValueSetAutocompleteProps } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodingInputProps
  extends Omit<ValueSetAutocompleteProps, 'defaultValue' | 'onChange' | 'disabled' | 'name'>,
    Omit<ComplexTypeInputProps<Coding>, 'onChange'> {
  readonly response?: QuestionnaireResponseItem;
  readonly onChange?: (value: Coding[]) => void;
}

export function CodingInput(props: CodingInputProps): JSX.Element {
  const { defaultValue, onChange, withHelpText, response, ...rest } = props;
  const [value, setValue] = useState<Coding[] | undefined>(() => {
    if (response?.answer?.[0]?.valueCoding) {
      return [response.answer[0].valueCoding];
    }
    if (defaultValue) {
      return [defaultValue];
    }
    return undefined;
  });

  function handleChange(newValues: ValueSetExpansionContains[]): void {
    if (newValues && newValues.length > 0) {
      const concepts = newValues.map((value) => valueSetElementToCoding(value));
      setValue(concepts);
      if (onChange) {
        onChange(concepts);
      }
    }
  }

  return (
    <ValueSetAutocomplete
      defaultValue={value?.map(codingToValueSetElement)}
      maxValues={1}
      onChange={handleChange}
      withHelpText={withHelpText ?? true}
      {...rest}
    />
  );
}

function codingToValueSetElement(coding: Coding): ValueSetExpansionContains {
  return {
    system: coding.system,
    code: coding.code,
    display: coding.display,
  };
}

function valueSetElementToCoding(element: ValueSetExpansionContains): Coding {
  return {
    system: element.system,
    code: element.code,
    display: element.display,
  };
}
