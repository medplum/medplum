// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isPopulated, isProfileLoaded } from '@medplum/core';
import { ElementDefinitionType, Extension } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { JSX, useEffect, useMemo, useState } from 'react';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

export type ExtensionInputProps = ComplexTypeInputProps<Extension> & {
  readonly propertyType: ElementDefinitionType;
};

export function ExtensionInput(props: ExtensionInputProps): JSX.Element | null {
  const { propertyType } = props;

  const medplum = useMedplum();
  const profileUrl: string | undefined = useMemo(() => {
    if (!isPopulated(propertyType.profile)) {
      return undefined;
    }

    return propertyType.profile[0] satisfies string;
  }, [propertyType]);
  const [loadingProfile, setLoadingProfile] = useState(profileUrl !== undefined);

  useEffect(() => {
    if (profileUrl) {
      setLoadingProfile(true);
      medplum
        .requestProfileSchema(profileUrl)
        .then(() => setLoadingProfile(false))
        .catch((reason) => {
          setLoadingProfile(false);
          console.warn(reason);
        });
    }
  }, [medplum, profileUrl]);

  if (profileUrl && (loadingProfile || !isProfileLoaded(profileUrl))) {
    return <div>Loading...</div>;
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
      typeName="Extension"
      defaultValue={props.defaultValue}
      onChange={props.onChange}
    />
  );
}
