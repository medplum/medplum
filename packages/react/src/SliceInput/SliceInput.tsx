import { Group, Stack } from '@mantine/core';
import { InternalSchemaElement, getPropertyDisplayName, isEmpty, isPopulated } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ElementsContext, ElementsContextType, buildElementsContext } from '../ElementsInput/ElementsInput.utils';
import { FormSection } from '../FormSection/FormSection';
import { ElementDefinitionTypeInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { ArrayAddButton } from '../buttons/ArrayAddButton';
import { ArrayRemoveButton } from '../buttons/ArrayRemoveButton';
import { killEvent } from '../utils/dom';
import classes from '../ResourceArrayInput/ResourceArrayInput.module.css';
import { SupportedSliceDefinition } from './SliceInput.utils';

export type SliceInputProps = Readonly<{
  path: string;
  slice: SupportedSliceDefinition;
  property: InternalSchemaElement;
  defaultValue: any[];
  onChange: (newValue: any[]) => void;
  outcome?: OperationOutcome;
  testId?: string;
}>;

function maybeWrapWithContext(contextValue: ElementsContextType | undefined, contents: JSX.Element): JSX.Element {
  if (contextValue) {
    return <ElementsContext.Provider value={contextValue}>{contents}</ElementsContext.Provider>;
  }

  return contents;
}

export function SliceInput(props: SliceInputProps): JSX.Element | null {
  const { slice, property, onChange } = props;
  const [defaultValue] = useState(() => props.defaultValue.map((v) => v ?? {}));
  const [values, setValues] = useState<any[]>(defaultValue);

  const sliceType = slice.typeSchema?.type ?? slice.type[0].code;
  const sliceElements = slice.typeSchema?.elements ?? slice.elements;

  const parentElementsContextValue = useContext(ElementsContext);

  const contextValue = useMemo(() => {
    if (isPopulated(sliceElements)) {
      return buildElementsContext({
        parentContext: parentElementsContextValue,
        elements: sliceElements,
        parentPath: props.path,
        parentType: sliceType,
      });
    }
    console.assert(false, 'Expected sliceElements to always be populated', slice.name);
    return undefined;
  }, [parentElementsContextValue, props.path, slice.name, sliceElements, sliceType]);

  const lastValue = useRef(defaultValue);
  useEffect(() => {
    if (onChange) {
      if (lastValue.current.length !== values.length || !lastValue.current.every((v, idx) => v === values[idx])) {
        onChange(values);
      }
    }
    lastValue.current = values;
  }, [values, onChange, props.path]);

  const valuesOnChange = useMemo(() => {
    const result: ((val: any) => void)[] = [];
    for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
      result.push((newValue: any) => {
        setValues((oldValues) => {
          const newValues = [...oldValues];
          newValues[valueIndex] = newValue;
          return newValues;
        });
      });
    }
    return result;
  }, [values.length]);

  const required = slice.min > 0;

  // this is a bit of a hack targeted at nested extensions; indentation would ideally be controlled elsewhere
  // e.g. USCorePatientProfile -> USCoreEthnicityExtension -> {ombCategory, detailed, text}
  const indentedStack = isEmpty(slice.elements);
  const propertyDisplayName = getPropertyDisplayName(slice.name);
  return maybeWrapWithContext(
    contextValue,
    <FormSection
      title={propertyDisplayName}
      description={slice.definition}
      withAsterisk={required}
      fhirPath={`${property.path}:${slice.name}`}
      testId={props.testId}
    >
      <Stack className={indentedStack ? classes.indented : undefined}>
        {values.map((value, valueIndex) => {
          return (
            <Group key={`${valueIndex}-${values.length}`} wrap="nowrap">
              <div style={{ flexGrow: 1 }} data-testid={props.testId && `${props.testId}-elements-${valueIndex}`}>
                <ElementDefinitionTypeInput
                  elementDefinitionType={slice.type[0]}
                  name={slice.name}
                  defaultValue={value}
                  onChange={valuesOnChange[valueIndex]}
                  outcome={props.outcome}
                  min={slice.min}
                  max={slice.max}
                  binding={slice.binding}
                  path={props.path}
                />
              </div>
              {values.length > slice.min && (
                <ArrayRemoveButton
                  propertyDisplayName={propertyDisplayName}
                  testId={props.testId && `${props.testId}-remove-${valueIndex}`}
                  onClick={(e: React.MouseEvent) => {
                    killEvent(e);
                    const newValues = [...values];
                    newValues.splice(valueIndex, 1);
                    setValues(newValues);
                  }}
                />
              )}
            </Group>
          );
        })}
        {values.length < slice.max && (
          <Group wrap="nowrap" style={{ justifyContent: 'flex-start' }}>
            <ArrayAddButton
              propertyDisplayName={propertyDisplayName}
              onClick={(e: React.MouseEvent) => {
                killEvent(e);
                const newValues = [...values, undefined];
                setValues(newValues);
              }}
              testId={props.testId && `${props.testId}-add`}
            />
          </Group>
        )}
      </Stack>
    </FormSection>
  );
}
