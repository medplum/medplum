import { Stack } from '@mantine/core';
import { InternalSchemaElement, getPathDisplayName, tryGetDataType } from '@medplum/core';
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

// Use a symbol to avoid collisions with 'property' appearing in a path
const PROPERTY = Symbol('property');
type WalkedPaths = {
  [key: string]: WalkedPaths | { [PROPERTY]: InternalSchemaElement };
};

interface IBackboneElementContext {
  inExtension: boolean;
  walkedPaths: WalkedPaths;
  seenKeys: Set<string>;
}

function splitRight(str: string, delim: string): [string, string] {
  const lastIndex = str.lastIndexOf(delim);
  const beginning = str.substring(0, lastIndex);
  const last = str.substring(lastIndex + 1, str.length);

  return [beginning, last];
}

function digObject(obj: any, props: string[]) {
  return props.reduce((prev, curr) => (prev && prev[curr] ? prev[curr] : undefined), obj);
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
      console.debug(typeSchema.name, { typeSchema });
    }
  }, [typeSchema]);

  const [walkedPaths, seenKeys] = useMemo(() => {
    const result: WalkedPaths = {};
    const seenKeys = new Set<string>();
    if (!typeSchema?.elements) {
      return [result, seenKeys];
    }

    for (const [key, property] of Object.entries(typeSchema.elements)) {
      const [beginning, last] = splitRight(key, '.');
      console.debug({ key, beginning, last, property });

      // assumes paths are hierarchically sorted, e.g. Patient.identifier comes before Patient.identifier.id
      if (seenKeys.has(beginning)) {
        let entry: WalkedPaths | undefined = result[beginning];
        if (entry === undefined) {
          entry = {};
          result[beginning] = entry;
        }
        entry[last] = { [PROPERTY]: property };
      }
      seenKeys.add(key);
    }
    return [result, seenKeys];
  }, [typeSchema?.elements]);

  if (!typeSchema) {
    return <div>{typeName}&nbsp;not implemented</div>;
  }

  const typedValue = { type: typeName, value };

  return (
    <BackboneElementContext.Provider value={{ inExtension: false, walkedPaths, seenKeys }}>
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

          // Profiles include definitions for nested properties that they have modified in some way
          // (e.g. restricting cardinality, specifying pattern[x], etc.
          // Do not render nested elements directly since that would result in them being displayed twice.
          const [beginning, _last] = splitRight(key, '.');
          if (seenKeys.has(beginning)) {
            // TODO {mattlong} walkedElements entries need to be used as nested elements
            // are rendered to overwrite their (default) InternalSchemaElement
            return null;
          }

          console.debug({ typeName: props.typeName, path: property.path, property });

          const [propertyValue, propertyType] = getValueAndType(typedValue, key);
          const required = property.min !== undefined && property.min > 0;

          if (property.type.length === 1 && property.type[0].code === 'boolean') {
            return (
              <CheckboxFormSection
                key={key}
                title={getPathDisplayName(key)}
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
              title={getPathDisplayName(key)}
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
