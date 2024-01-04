import classes from './ResourceArrayInput.module.css';
import { Group, Stack } from '@mantine/core';
import { InternalSchemaElement, getPropertyDisplayName, isEmpty } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useState } from 'react';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { FormSection } from '../FormSection/FormSection';
import { ElementDefinitionTypeInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { killEvent } from '../utils/dom';
import { SupportedSliceDefinition } from './SliceInput.utils';
import { ArrayAddButton } from '../buttons/ArrayAddButton';
import { ArrayRemoveButton } from '../buttons/ArrayRemoveButton';

export type SliceInputProps = Readonly<{
  slice: SupportedSliceDefinition;
  property: InternalSchemaElement;
  defaultValue: any[];
  onChange: (newValue: any[]) => void;
  outcome?: OperationOutcome;
  testId?: string;
}>;

export function SliceInput(props: SliceInputProps): JSX.Element | null {
  const { slice, property } = props;
  const [values, setValues] = useState<any[]>(() => {
    return props.defaultValue.map((v) => v ?? {});
  });

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
  return (
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
              <div style={{ flexGrow: 1 }}>
                <Stack>
                  {!isEmpty(slice.elements) ? (
                    <ElementsInput
                      type={slice.type[0].code}
                      elements={slice.elements}
                      defaultValue={value}
                      outcome={props.outcome}
                      onChange={(newValue) => {
                        const newValues = [...values];
                        newValues[valueIndex] = newValue;
                        setValuesWrapper(newValues);
                      }}
                      testId={props.testId && `${props.testId}-elements-${valueIndex}`}
                    />
                  ) : (
                    <ElementDefinitionTypeInput
                      elementDefinitionType={slice.type[0]}
                      name={slice.name}
                      defaultValue={value}
                      onChange={(newValue) => {
                        const newValues = [...values];
                        newValues[valueIndex] = newValue;
                        setValuesWrapper(newValues);
                      }}
                      outcome={undefined}
                      min={slice.min}
                      max={slice.max}
                      binding={undefined}
                      path={slice.path}
                    />
                  )}
                </Stack>
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
