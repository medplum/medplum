import { InternalTypeSchema, getDataType, isPopulated, isProfileLoaded, tryGetProfile } from '@medplum/core';
import { useMedplum } from '@medplum/react-hooks';
import { useState, useMemo, useEffect } from 'react';
import { BackboneElementDisplay } from '../BackboneElementDisplay/BackboneElementDisplay';
import { ElementDefinitionType } from '@medplum/fhirtypes';

export type ExtensionDisplayProps = {
  /** The path identifies the element and is expressed as a "."-separated list of ancestor elements, beginning with the name of the resource or extension. */
  readonly path: string;
  readonly elementDefinitionType?: ElementDefinitionType;
  readonly value: any;
  readonly ignoreMissingValues?: boolean;
  readonly link?: boolean;
  readonly compact?: boolean;
  /** (optional) Profile URL of the structure definition represented by the backbone element */
  readonly profileUrl?: string;
};

export function ExtensionDisplay(props: ExtensionDisplayProps): JSX.Element | null {
  const { elementDefinitionType } = props;

  const medplum = useMedplum();
  const [typeSchema, setTypeSchema] = useState<InternalTypeSchema>(getDataType('Extension'));
  const profileUrl: string | undefined = useMemo(() => {
    if (!isPopulated(elementDefinitionType?.profile)) {
      return undefined;
    }

    return elementDefinitionType.profile[0] satisfies string;
  }, [elementDefinitionType]);
  const [loadingProfile, setLoadingProfile] = useState(profileUrl !== undefined);

  useEffect(() => {
    if (profileUrl) {
      setLoadingProfile(true);
      medplum
        .requestProfileSchema(profileUrl)
        .then(() => {
          const profile = tryGetProfile(profileUrl);
          setLoadingProfile(false);
          if (profile) {
            setTypeSchema(profile);
          }
        })
        .catch((reason) => {
          setLoadingProfile(false);
          console.warn(reason);
        });
    }
  }, [medplum, profileUrl]);

  if (profileUrl && (loadingProfile || !isProfileLoaded(profileUrl))) {
    return <div>Loading...</div>;
  }

  return (
    <BackboneElementDisplay
      path={props.path}
      value={{ type: typeSchema.name, value: props.value }}
      compact={props.compact}
      ignoreMissingValues={props.ignoreMissingValues}
      link={props.link}
      profileUrl={profileUrl}
    />
  );
}
