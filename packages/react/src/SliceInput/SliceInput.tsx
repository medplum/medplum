import { Group, Stack } from '@mantine/core';
import {
  ElementsContextType,
  InternalSchemaElement,
  SliceDefinitionWithTypes,
  buildElementsContext,
  getPropertyDisplayName,
  isEmpty,
  isPopulated,
} from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { FormSection } from '../FormSection/FormSection';
import { ElementDefinitionTypeInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { ArrayAddButton } from '../buttons/ArrayAddButton';
import { ArrayRemoveButton } from '../buttons/ArrayRemoveButton';
import { killEvent } from '../utils/dom';
import classes from '../ResourceArrayInput/ResourceArrayInput.module.css';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

export interface SliceInputProps {
  readonly path: string;
  readonly slice: SliceDefinitionWithTypes;
  readonly property: InternalSchemaElement;
  readonly defaultValue: any[];
  readonly onChange: (newValue: any[]) => void;
  readonly outcome?: OperationOutcome;
  readonly testId?: string;
}

export function SliceInput(props: SliceInputProps): JSX.Element | null {
  const { slice, property } = props;
  const [values, setValues] = useState<any[]>(() => {
    return props.defaultValue.map((v) => v ?? {});
  });

  const sliceElements = slice.typeSchema?.elements ?? slice.elements;

  const parentElementsContextValue = useContext(ElementsContext);

  const contextValue: ElementsContextType | undefined = useMemo(() => {
    if (isPopulated(sliceElements)) {
      return buildElementsContext({
        parentContext: parentElementsContextValue,
        elements: sliceElements,
        path: props.path,
        profileUrl: slice.typeSchema?.url,
      });
    }
    console.assert(false, 'Expected sliceElements to always be populated', props.path);
    return undefined;
  }, [parentElementsContextValue, props.path, slice.typeSchema?.url, sliceElements]);

  function setValuesWrapper(newValues: any[]): void {
    setValues(newValues);
    if (props.onChange) {
      props.onChange(newValues);
    }
  }

  const required = slice.min > 0;

  // this is a bit of a hack targeted at nested extensions; indentation would ideally be controlled elsewhere
  // e.g. USCorePatientProfile -> USCoreEthnicityExtension -> {ombCategory, detailed, text}
  const indentedStack = isEmpty(slice.elements);
  const propertyDisplayName = getPropertyDisplayName(slice.name);
  return maybeWrapWithContext(
    ElementsContext.Provider,
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
                  onChange={(newValue) => {
                    const newValues = [...values];
                    newValues[valueIndex] = newValue;
                    setValuesWrapper(newValues);
                  }}
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
                    setValuesWrapper(newValues);
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
                setValuesWrapper(newValues);
              }}
              testId={props.testId && `${props.testId}-add`}
            />
          </Group>
        )}
      </Stack>
    </FormSection>
  );
}
