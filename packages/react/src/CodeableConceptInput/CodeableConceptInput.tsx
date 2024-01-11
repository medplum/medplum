import { CodeableConcept, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ValueSetAutocomplete, ValueSetAutocompleteProps } from '../ValueSetAutocomplete/ValueSetAutocomplete';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { deepClone, deepEquals, isPopulated } from '@medplum/core';

export type CodeableConceptInputProps = Omit<ValueSetAutocompleteProps, 'defaultValue' | 'onChange'> &
  ComplexTypeInputProps<CodeableConcept> & {
    onChange: ((value: CodeableConcept | undefined) => void) | undefined;
  };

export function CodeableConceptInput(props: CodeableConceptInputProps): JSX.Element {
  const { defaultValue, onChange, path, ...rest } = props;
  const { getElementByPath } = useContext(ElementsContext);

  const elements = useMemo(() => {
    return {
      self: getElementByPath(path),
      system: getElementByPath(path + '.coding.system'),
      code: getElementByPath(path + '.coding.code'),
      display: getElementByPath(path + '.coding.display'),
    };
  }, [getElementByPath, path]);
  const isReadonly = [elements.system, elements.code, elements.display].some((elem) => isPopulated(elem?.fixed));
  const valueDirtyRef = useRef({ isDirty: false, lastValue: undefined as CodeableConcept | undefined });
  const [value, setValue] = useState<CodeableConcept | undefined>(() => {
    const result: CodeableConcept = defaultValue ? deepClone(defaultValue) : {};

    if (elements.self?.pattern) {
      // example {"coding":[{"system":"http://loinc.org","code":"85354-9"}]}
      const pattern = elements.self.pattern.value;
      if (pattern.text && result.text === undefined) {
        result.text = pattern.text;
      }

      if (pattern.coding) {
        for (const patternCoding of pattern.coding) {
          result.coding ??= [];
          if (result.coding.length === 0) {
            result.coding.push(Object.create(null));
          }
          for (const key of ['system', 'code', 'display'] as ('system' | 'code' | 'display')[]) {
            result.coding.forEach((coding) => {
              if (patternCoding[key] && coding[key] === undefined) {
                coding[key] = patternCoding[key];
              }
            });
          }
        }
      }
      console.log(`${props.path} self`, JSON.stringify(elements.self.pattern.value), JSON.stringify(result));
    }

    if ([elements.system, elements.code, elements.display].some((elem) => isPopulated(elem?.fixed))) {
      result.coding ??= [];
      if (result.coding.length === 0) {
        result.coding.push({});
      }

      for (const key of ['system', 'code', 'display'] as ('system' | 'code' | 'display')[]) {
        const element = elements[key];
        const value = element?.fixed?.value;
        if (value) {
          result.coding.forEach((coding) => (coding[key] = value));
        }
      }
      console.log(
        `${props.path} sub-elements`,
        JSON.stringify([elements.system, elements.code, elements.display].map((elem) => elem?.fixed?.value)),
        JSON.stringify(result)
      );
    }

    if (isPopulated(result) && !deepEquals(result, defaultValue)) {
      valueDirtyRef.current = { isDirty: true, lastValue: defaultValue };
      return result;
    } else {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (valueDirtyRef.current.isDirty) {
      if (onChange) {
        console.log(`${props.path} weird onChange`, JSON.stringify(value));
        onChange(value);
      }
      valueDirtyRef.current.isDirty = false;
      valueDirtyRef.current.lastValue = undefined;
    }
  }, [onChange, props.path, value]);

  const handleChange = useCallback(
    (newValues: ValueSetExpansionContains[]): void => {
      const newConcept = valueSetElementToCodeableConcept(newValues);
      setValue(newConcept);
      if (onChange) {
        onChange(newConcept);
      }
    },
    [onChange]
  );

  return (
    <ValueSetAutocomplete
      readOnly={isReadonly}
      disabled={isReadonly}
      aria-disabled={isReadonly}
      defaultValue={value && codeableConceptToValueSetElement(value)}
      onChange={handleChange}
      {...rest}
    />
  );
}

function codeableConceptToValueSetElement(concept: CodeableConcept): ValueSetExpansionContains[] | undefined {
  return concept.coding?.map((c) => ({
    system: c.system,
    code: c.code,
    display: c.display,
  }));
}

function valueSetElementToCodeableConcept(elements: ValueSetExpansionContains[]): CodeableConcept | undefined {
  if (elements.length === 0) {
    return undefined;
  }
  return {
    coding: elements.map((e) => ({
      system: e.system,
      code: e.code,
      display: e.display,
    })),
  };
}
