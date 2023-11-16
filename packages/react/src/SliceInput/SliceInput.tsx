import React from 'react';
import { InternalSchemaElement, SliceDefinition, getPropertyDisplayName } from '@medplum/core';
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

  let description: React.ReactNode = slice.definition;
  if (DEBUG) {
    let debugDescription;
    const profileUrls = slice.type[0].profile;
    if (profileUrls) {
      debugDescription = (
        <span>
          {profileUrls.map((url) => {
            return (
              <a key={url} href={url} target="_blank">
                {url}
              </a>
            );
          })}
        </span>
      );
    } else {
      debugDescription = `type: ${JSON.stringify(slice.type)}`;
    }

    description = (
      <>
        {debugDescription}
        <br />
        {description}
      </>
    );
  }

  const required = property.min !== undefined && property.min > 0;
  // TODO{mattlong}  handle adding/removing values similar to ResourceArrayInput
  return (
    <FormSection
      title={getPropertyDisplayName(slice.name)}
      description={description}
      withAsterisk={required}
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

            return <ResourcePropertyInput key={key} property={element} name={key} />;
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
