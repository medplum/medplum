import { JsonInput } from '@mantine/core';
import { InternalTypeSchema, stringify, tryGetProfile } from '@medplum/core';
import { ElementDefinitionType, Extension } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

export type ExtensionInputProps = ComplexTypeInputProps<Extension> & {
  propertyType: ElementDefinitionType;
};

export function ExtensionInput(props: ExtensionInputProps): JSX.Element | null {
  const { propertyType } = props;

  const medplum = useMedplum();
  const [loading, setLoading] = useState(false);
  const [typeSchema, setTypeSchema] = useState<InternalTypeSchema | undefined>();

  const profileUrl: string | undefined = useMemo(() => {
    if (!propertyType.profile || propertyType.profile.length === 0) {
      console.debug('Extension.type[0].profile is missing or empty', propertyType);
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
          const profile = tryGetProfile(profileUrl);
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

  if (!profileUrl) {
    // TODO{profiles} should there be a ResourceForm context to disable all profile-specific behavior?
    // revert to JSON if the extension doesn't have a profile URL specified
    return <ExtensionJsonInput {...props} />;
  }

  if (loading) {
    return <div>Loading {profileUrl}...</div>;
  }

  if (!typeSchema) {
    return <div>StructureDefinition for {profileUrl} not found</div>;
  }

  /*
    From the spec:
    An extension SHALL have either a value (i.e. a value[x] element) or sub-extensions, but not both.
    If present, the value[x] element SHALL have content (value attribute or other elements)
  */

  // const valueElement = typeSchema.elements['value[x]'];
  // const extensionHasValue = valueElement.max !== 0;
  // console.debug(typeSchema.name, { extensionHasValue });
  // It seems like the behavior of ExtensionInput should differ based on extensionHasValue. It likely
  // isn't strictly necessary to do so given the recursive use of BackboneElementInput

  return (
    <BackboneElementInput
      profileUrl={profileUrl}
      typeName={typeSchema.name}
      defaultValue={props.defaultValue}
      onChange={onChange}
      type={typeSchema?.type}
    />
  );
}

function ExtensionJsonInput(props: ExtensionInputProps): JSX.Element {
  return (
    <JsonInput
      id={props.name}
      name={props.name}
      data-testid="extension-json-input"
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
