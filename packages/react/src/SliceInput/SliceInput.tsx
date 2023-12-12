import React, { useState } from 'react';
import { InternalSchemaElement, getPropertyDisplayName, isEmpty } from '@medplum/core';
import { FormSection } from '../FormSection/FormSection';
import { ActionIcon, Group, Stack } from '@mantine/core';
import { ElementDefinitionTypeInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { killEvent } from '../utils/dom';
import { IconCircleMinus, IconCirclePlus } from '@tabler/icons-react';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { OperationOutcome } from '@medplum/fhirtypes';
import { SupportedSliceDefinition } from './SliceInput.utils';

type SliceInputProps = {
  slice: SupportedSliceDefinition;
  property: InternalSchemaElement;
  defaultValue: any[];
  onChange: (newValue: any[]) => void;
  outcome?: OperationOutcome;
  testId?: string;
};
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
  const stackStyle = Object.keys(slice.elements).length > 0 ? undefined : { marginTop: '1rem', marginLeft: '1rem' };
  return (
    <FormSection
      title={getPropertyDisplayName(slice.name)}
      description={slice.definition}
      withAsterisk={required}
      fhirPath={`${property.path}:${slice.name}`}
      testId={props.testId}
    >
      <Stack style={stackStyle}>
        {values.map((value, valueIndex) => {
          return (
            <Group key={`${valueIndex}-${values.length}`} noWrap>
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
                <div>
                  <ActionIcon
                    title="Remove"
                    size="sm"
                    data-testid={props.testId && `${props.testId}-remove-${valueIndex}`}
                    onClick={(e: React.MouseEvent) => {
                      killEvent(e);
                      const newValues = [...values];
                      newValues.splice(valueIndex, 1);
                      setValuesWrapper(newValues);
                    }}
                  >
                    <IconCircleMinus />
                  </ActionIcon>
                </div>
              )}
            </Group>
          );
        })}
        {values.length < slice.max && (
          <Group noWrap style={{ justifyContent: 'flex-end' }}>
            <div>
              <ActionIcon
                title="Add"
                size="sm"
                color="green"
                data-testid={props.testId && `${props.testId}-add`}
                onClick={(e: React.MouseEvent) => {
                  killEvent(e);
                  const newValues = [...values, undefined];
                  setValuesWrapper(newValues);
                }}
              >
                <IconCirclePlus />
              </ActionIcon>
            </div>
          </Group>
        )}
      </Stack>
    </FormSection>
  );
}
