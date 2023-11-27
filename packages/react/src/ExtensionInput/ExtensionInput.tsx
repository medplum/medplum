import { JsonInput } from '@mantine/core';
import { InternalTypeSchema, stringify, tryGetDataTypeByUrl } from '@medplum/core';
import { ElementDefinitionType, Extension } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';

export interface ExtensionInputNewProps {
  propertyType: ElementDefinitionType;
  name: string;
  defaultValue?: Extension;
  onChange?: (value: Extension) => void;
}

export function ExtensionInput(props: ExtensionInputNewProps): JSX.Element | null {
  const { propertyType } = props;

  const medplum = useMedplum();
  const [loading, setLoading] = useState(false);
  const [typeSchema, setTypeSchema] = useState<InternalTypeSchema | undefined>();

  const profileUrl: string | undefined = useMemo(() => {
    if (!propertyType.profile) {
      console.debug('Extension.type[0].profile is missing', propertyType);
      return undefined;
    }

    if (propertyType.profile.length > 1) {
      console.log('Extension.type[0].profile has more than one item', propertyType);
    }

    return propertyType.profile[0] satisfies string;
  }, [propertyType]);

  useEffect(() => {
    if (profileUrl) {
      setLoading(true);
      medplum
        .requestProfileSchema(profileUrl)
        .then(() => {
          const profile = tryGetDataTypeByUrl(profileUrl);
          setLoading(false);
          setTypeSchema(profile);
        })
        .catch((reason) => {
          setLoading(false);
          console.warn(reason);
        });
    }
  }, [medplum, profileUrl]);

  function onChange(newValue: any): void {
    if (props.onChange) {
      console.log('Extension', newValue);
      props.onChange(newValue);
    }
  }

  // nothing to show if the extension doesn't have a profile
  if (!profileUrl) {
    return null;
  }

  if (loading) {
    return <div>Loading {profileUrl}...</div>;
  }

  if (!typeSchema) {
    return <div>StructureDefinition for {profileUrl} not found</div>;
  }

  const valueElement = typeSchema.elements['value[x]']; //TODO why is the type of valueElement not possibly undefined here?
  const extensionHasValue = valueElement.max !== 0;
  console.debug(typeSchema.name, { extensionHasValue });

  /*
    From the spec:
    An extension SHALL have either a value (i.e. a value[x] element) or sub-extensions, but not both.
    If present, the value[x] element SHALL have content (value attribute or other elements)
  */

  // It seems like the behavior of ExtensionInput should differ based on extensionHasValue. It likely
  // isn't strictly necessary to do so given the recursive use of BackboneElementInput

  // const elements: Record<string, InternalSchemaElement> = {};
  // for (const [key, element] of Object.entries(typeSchema.elements)) {
  //   if (key === 'value[x]' || key === 'extension') {
  //     elements[key] = element;
  //   }
  // }
  // return <ElementsInput elements={elements} defaultValue={undefined} outcome={undefined} onChange={undefined} />;

  return (
    <BackboneElementInput
      typeName={typeSchema.name}
      defaultValue={props.defaultValue}
      onChange={onChange}
      type={typeSchema?.type}
    />
  );
}

export interface ExtensionJsonInputProps {
  name: string;
  defaultValue?: Extension;
  onChange?: (value: Extension) => void;
}

export function ExtensionJsonInput(props: ExtensionJsonInputProps): JSX.Element {
  return (
    <JsonInput
      id={props.name}
      name={props.name}
      data-testid="extension-input"
      defaultValue={stringify(props.defaultValue)}
      deserialize={JSON.parse}
      onChange={(newValue) => {
        if (props.onChange) {
          props.onChange(JSON.parse(newValue));
        }
      }}
    />
  );
}
