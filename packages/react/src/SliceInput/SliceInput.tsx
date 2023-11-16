import React from 'react';
import { InternalSchemaElement, SliceDefinition } from '@medplum/core';
import { FormSection } from '../FormSection/FormSection';
import { Stack } from '@mantine/core';
import { ElementDefinitionTypeInput, ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';

type SliceInputProps = {
  slice: SliceDefinition;
  property: InternalSchemaElement;
  defaultValue: any[];
  onChange: (newValue: any[]) => void;
};

type PopulatedSliceDefinition = SliceDefinition & {
  type: NonNullable<SliceDefinition['type']>;
};

function isPopulatedSliceDefinition(slice: SliceDefinition): slice is PopulatedSliceDefinition {
  if (slice.type === undefined || slice.type.length === 0) {
    return false;
  }
  return true;
}

function sliceToInternalSchemaElement(slice: PopulatedSliceDefinition): InternalSchemaElement {
  const result: InternalSchemaElement = {
    description: 'Description TODO',
    path: 'TODO',
    min: slice.min,
    max: slice.max,
    type: slice.type,
  };

  return result;
}

const DEBUG = false;

export function SliceInput(props: SliceInputProps): JSX.Element | null {
  const { slice, property } = props;

  if (!isPopulatedSliceDefinition(slice)) {
    console.log('WARN slice.type is missing or empty', slice.type);
    return null;
  }

  const values = props.defaultValue;
  const sliceSchemaElement = sliceToInternalSchemaElement(slice);

  // TODO{mattlong}  handle adding/removing values similar to ResourceArrayInput
  return (
    <FormSection
      title={slice.name}
      description={`SliceInput.FormSection type: ${JSON.stringify(slice.type)}`}
      fhirPath={`${property.path}:${slice.name}`}
    >
      <Stack style={{ marginTop: '1rem', marginLeft: '1rem' }}>
        {values.map((value, index) => {
          const elementInputs = Object.entries(slice.elements).map(([key, element]) => {
            if (key === 'id') {
              return null;
            }

            if (key === 'url') {
              return null;
            }

            if (key === 'extension') {
              return null;
            }

            return (
              <div key={key}>
                {DEBUG && (
                  <>
                    <div>slice.element[{key}]:</div>
                    {Object.entries(element).map(([key, val]) => {
                      return (
                        <div key={key}>
                          {key}: {JSON.stringify(val)}
                        </div>
                      );
                    })}
                  </>
                )}
                <ResourcePropertyInput property={element} name={key} />
              </div>
            );
          });

          //TODO{mattlong} handle multiple slice types
          const inputComponent = (
            <ElementDefinitionTypeInput
              elementDefinitionType={slice.type[0]}
              property={sliceSchemaElement}
              name={slice.name}
            />
          );
          return (
            <Stack key={index}>
              {elementInputs}
              {inputComponent}
            </Stack>
          );
        })}
      </Stack>
    </FormSection>
  );
}
