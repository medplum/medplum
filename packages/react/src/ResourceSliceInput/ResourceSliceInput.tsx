import { InternalSchemaElement, tryGetDataTypeByUrl } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import React, { useEffect, useMemo, useState } from 'react';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';

export interface ResourceSliceInputProps {
  property: InternalSchemaElement;
  name: string;
  sliceName: string;
  profileUrl: string;
  defaultPropertyType?: string;
  defaultValue?: any;
  onChange?: (value: any, propName?: string) => void;
  outcome?: OperationOutcome;
}

// Each slice should be presented as a FormSection
export function ResourceSliceInput(props: ResourceSliceInputProps): JSX.Element {
  const { profileUrl, defaultValue, onChange, outcome } = props;
  const medplum = useMedplum();
  const [schemaLoaded, setSchemaLoaded] = useState(false);

  useEffect(() => {
    if (profileUrl) {
      console.debug(`requesting schema for ${profileUrl}`);
      medplum
        .requestProfileSchema(profileUrl)
        .then(() => setSchemaLoaded(true))
        .catch(console.log);
    }
  }, [medplum, profileUrl]);

  const typeSchema = useMemo(() => {
    if (!schemaLoaded) {
      return undefined;
    }

    const result = tryGetDataTypeByUrl(profileUrl);
    console.log(`schema for ${profileUrl}`, result);
    return result;
  }, [profileUrl, schemaLoaded]);

  if (!schemaLoaded) {
    return <div>Loading...</div>;
  }

  if (!typeSchema) {
    return <div>Uh oh, typeSchema should exist</div>;
  }

  //TODO{mattlong} should this render ExtensionInput instead of Backbone if its an extension?
  return (
    <BackboneElementInput
      typeName={typeSchema?.name}
      defaultValue={defaultValue}
      outcome={outcome}
      onChange={onChange}
      type={typeSchema?.type}
    />
  );
  // return (
  //   <Group>
  //     <div>{sliceName}</div>
  //     <div>{JSON.stringify(defaultValue)}</div>
  //     <div>{JSON.stringify(typeSchema)}</div>
  //   </Group>
  // );

  // const propertyTypes = property.type as ElementDefinitionType[];
  // if (propertyTypes.length > 1) {
  //   return <ElementDefinitionInputSelector elementDefinitionTypes={propertyTypes} {...props} />;
  // } else {
  //   return <ElementDefinitionTypeInput elementDefinitionType={propertyTypes[0]} {...props} />;
  // }
}
