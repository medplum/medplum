import { JsonInput } from '@mantine/core';
import { ElementType, InternalSchemaElement, stringify, tryGetDataTypeByUrl } from '@medplum/core';
import { Extension } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';

export interface ExtensionInputNewProps {
  property: InternalSchemaElement;
  name: string;
  defaultValue?: Extension;
  onChange?: (value: Extension) => void;
}

export function ExtensionInput(props: ExtensionInputNewProps): JSX.Element | null {
  const { property } = props;

  const medplum = useMedplum();
  const [schemaLoaded, setSchemaLoaded] = useState<string>();

  const profileUrl: string | undefined = useMemo(() => {
    if (property.type.length === 0) {
      console.log('WARN property.type is missing');
    } else if (property.type.length > 1) {
      console.log('WARN property.type has more than one item', property.type);
    }

    const propertyType: ElementType = property.type[0];

    if (propertyType.targetProfile && propertyType.targetProfile.length > 0) {
      // TODO{mattlong} what to do with targetProfile?
      console.log('WARN property.type[0].targetProfile exists', propertyType);
    }

    if (!propertyType.profile) {
      console.debug('property.type[0].profile is missing', propertyType, property);
      return undefined;
    } else if (propertyType.profile.length > 1) {
      // TODO{mattlong} what to do if profile has more than one entry?
      console.log('WARN property.type[0].profile has more than one item', propertyType);
      return undefined;
    }

    return propertyType.profile[0] satisfies string;
  }, [property.type]);

  useEffect(() => {
    if (profileUrl) {
      console.debug(`requesting schema for ${profileUrl}`);
      medplum
        .requestProfileSchema(profileUrl)
        .then(() => setSchemaLoaded(profileUrl))
        .catch(console.warn);
    }
  }, [medplum, profileUrl]);

  const typeSchema = useMemo(() => {
    if (!schemaLoaded) {
      return undefined;
    }

    const result = tryGetDataTypeByUrl(schemaLoaded);
    console.debug(`schema for ${schemaLoaded}`, result);
    return result;
  }, [schemaLoaded]);

  const onChange = (newValue: any): void => {
    console.log(`TODO ExtensionInput.onChange`, newValue);
  };

  // nothing to show if the extension doesn't have a profile
  if (!profileUrl) {
    return null;
  }

  if (!schemaLoaded) {
    return <div>Loading...{JSON.stringify(property.type)}</div>;
  }

  if (!typeSchema) {
    return <div>StructureDefinition for {profileUrl} not found</div>;
  }

  return (
    <BackboneElementInput
      typeName={typeSchema?.name}
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
