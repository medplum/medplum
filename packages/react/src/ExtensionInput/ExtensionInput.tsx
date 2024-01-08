import { JsonInput } from '@mantine/core';
import { InternalTypeSchema, stringify, tryGetProfile, isProfileLoaded } from '@medplum/core';
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
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [typeSchema, setTypeSchema] = useState<InternalTypeSchema | undefined>();
  const profileUrl: string | undefined = useMemo(() => {
    if (!propertyType.profile || propertyType.profile.length === 0) {
      return undefined;
    }

    return propertyType.profile[0] satisfies string;
  }, [propertyType]);

  useEffect(() => {
    if (profileUrl) {
      setLoadingProfile(true);
      medplum
        .requestProfileSchema(profileUrl)
        .then(() => {
          const profile = tryGetProfile(profileUrl);
          setLoadingProfile(false);
          setTypeSchema(profile);
        })
        .catch((reason) => {
          setLoadingProfile(false);
          console.warn(reason);
        });
    }
  }, [medplum, profileUrl]);

  function onChange(newValue: any): void {
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  if (!profileUrl) {
    return <ExtensionJsonInput {...props} />;
  }

  if (profileUrl && (loadingProfile || !isProfileLoaded(profileUrl))) {
    return <div>Loading...</div>;
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
      path={props.path}
      typeName={typeSchema?.name ?? 'Extension'}
      defaultValue={props.defaultValue}
      onChange={onChange}
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
