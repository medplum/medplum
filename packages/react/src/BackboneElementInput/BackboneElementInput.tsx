import { Stack } from '@mantine/core';
import { getPropertyDisplayName, tryGetDataType } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { DEFAULT_IGNORED_NON_NESTED_PROPERTIES, DEFAULT_IGNORED_PROPERTIES } from '../constants';
import { FormSection } from '../FormSection/FormSection';
import { ResourceFormContext, setPropertyValue } from '../ResourceForm/ResourceForm.utils';
import { getValueAndType } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';

const EXTENSION_KEYS = ['extension', 'modifierExtension'];

export interface BackboneElementInputProps {
  typeName: string;
  type?: string;
  defaultValue?: any;
  outcome?: OperationOutcome;
  onChange?: (value: any) => void;
}

interface IBackboneElementContext {
  inExtension: boolean;
}

const BackboneElementContext = createContext(undefined as IBackboneElementContext | undefined);

export function BackboneElementInput(props: BackboneElementInputProps): JSX.Element {
  const { typeName } = props;
  const { includeExtensions } = useContext(ResourceFormContext);
  const [value, setValue] = useState<any>(props.defaultValue ?? {});

  function setValueWrapper(newValue: any): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  const typeSchema = useMemo(() => tryGetDataType(typeName), [typeName]);
  useEffect(() => {
    if (typeSchema) {
      console.log(typeSchema.name, { typeSchema });
    }
  }, [typeSchema]);

  if (!typeSchema) {
    return <div>{typeName}&nbsp;not implemented</div>;
  }

  const typedValue = { type: typeName, value };

  return (
    <BackboneElementContext.Provider value={{ inExtension: false }}>
      <Stack style={{ flexGrow: 1 }}>
        {Object.entries(typeSchema.elements).map(([key, property]) => {
          if (includeExtensions && EXTENSION_KEYS.includes(key)) {
            // extensions without slices can safely be skipped?
            if (!property.slicing && property.type.length === 1 && property.type[0].code === 'Extension') {
              console.debug(`SKIPPING ${property.path} since it is an Extension with no slices`, typeSchema);
              return null;
            }
          } else if (key === 'id' || DEFAULT_IGNORED_PROPERTIES.includes(key)) {
            return null;
          } else if (DEFAULT_IGNORED_NON_NESTED_PROPERTIES.includes(key) && property.path.split('.').length === 2) {
            return null;
          }
          if (!property.type) {
            return null;
          }

          // Extension.url is never user-facing
          if (props.type === 'Extension' && key === 'url') {
            return null;
          }

          if (property.max === 0) {
            return null;
          }

          console.debug({ typeName: props.typeName, path: property.path, type: property.type });

          const [propertyValue, propertyType] = getValueAndType(typedValue, key);
          const required = property.min !== undefined && property.min > 0;

          if (property.type.length === 1 && property.type[0].code === 'boolean') {
            return (
              <CheckboxFormSection
                key={key}
                title={getPropertyDisplayName(key)}
                description={property.description}
                htmlFor={key}
                fhirPath={property.path}
                withAsterisk={required}
              >
                <ResourcePropertyInput
                  property={property}
                  name={key}
                  defaultValue={propertyValue}
                  defaultPropertyType={propertyType}
                  outcome={props.outcome}
                  onChange={(newValue: any, propName?: string) => {
                    setValueWrapper(setPropertyValue(value, key, propName ?? key, property, newValue));
                  }}
                />
              </CheckboxFormSection>
            );
          }

          const resourcePropertyInput = (
            <ResourcePropertyInput
              key={key}
              property={property}
              name={key}
              defaultValue={propertyValue}
              defaultPropertyType={propertyType}
              onChange={(newValue: any, propName?: string) => {
                setValueWrapper(setPropertyValue(value, key, propName ?? key, property, newValue));
              }}
            />
          );

          // skip FormSection wrapper fo extensions
          if (props.type === 'Extension' || EXTENSION_KEYS.includes(key)) {
            return resourcePropertyInput;
          }

          return (
            <FormSection
              key={key}
              title={getPropertyDisplayName(key)}
              description={property.description}
              withAsterisk={required}
              htmlFor={key}
              outcome={props.outcome}
              fhirPath={property.path}
            >
              {resourcePropertyInput}
            </FormSection>
          );
        })}
      </Stack>
    </BackboneElementContext.Provider>
  );
}
