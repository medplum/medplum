import { Bundle, BundleEntry, createReference, ElementDefinition, Operator, Reference, Resource } from '@medplum/core';
import React, { useEffect, useRef, useState } from 'react';
import { Autocomplete } from './Autocomplete';
import { Avatar } from './Avatar';
import { useMedplum } from './MedplumProvider';
import { ResourceName } from './ResourceName';

export interface ReferenceInputProps {
  property?: ElementDefinition;
  name: string;
  value?: Reference;
}

export function ReferenceInput(props: ReferenceInputProps) {
  const medplum = useMedplum();
  const [initialResourceType] = (props.value?.reference || '/').split('/');
  const [value, setValue] = useState<Reference | undefined>(props.value);
  const [resourceType, setResourceType] = useState<string | undefined>(initialResourceType);
  const [targetTypes, setTargetTypes] = useState<string[] | undefined>();

  const valueRef = useRef<Reference>();
  valueRef.current = value;

  useEffect(() => {
    const targetProfile = props.property?.type?.[0]?.targetProfile;
    if (targetProfile) {
      const typeNames = targetProfile.map(p => p.split('/').pop() as string);
      setTargetTypes(typeNames);
      setResourceType(typeNames[0]);
    } else {
      setTargetTypes(undefined);
    }
  }, [props.property]);

  return (
    <table style={{ tableLayout: 'fixed' }}>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={JSON.stringify(value) || ''} readOnly={true} />
            {targetTypes ? (
              <select
                data-testid="reference-input-resource-type-select"
                defaultValue={resourceType}
                onChange={e => setResourceType(e.currentTarget.value)}
              >
                {targetTypes.map(targetType => (
                  <option key={targetType} value={targetType}>{targetType}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                data-testid="reference-input-resource-type-input"
                defaultValue={resourceType}
                onChange={e => {
                  setResourceType(e.currentTarget.value);
                }}
              />
            )}
          </td>
          <td>
            {resourceType && (
              <Autocomplete
                loadOptions={(input: string): Promise<(Reference | Resource)[]> => {
                  return medplum.search({
                    resourceType,
                    filters: [{
                      code: 'name',
                      operator: Operator.EQUALS,
                      value: input
                    }]
                  })
                    .then((bundle: Bundle) => (bundle.entry as BundleEntry[]).map(entry => entry.resource as Resource));
                }}
                getId={(value: Reference | Resource) => {
                  if ('resourceType' in value) {
                    return (value as Resource).id as string;
                  }
                  if ('reference' in value) {
                    return (value as Reference).reference as string;
                  }
                  return value.toString();
                }}
                getIcon={(value: Reference | Resource) => <Avatar value={value} />}
                getDisplay={(value: Reference | Resource) => <ResourceName value={value} />}
                name={props.name + '-id'}
                defaultValue={props.value ? [props.value] : undefined}
                onChange={(value: (Reference | Resource)[]) => {
                  if (value.length > 0) {
                    if ('resourceType' in value[0]) {
                      setValue(createReference(value[0] as Resource));
                    } else if ('reference' in value[0]) {
                      setValue(value[0] as Reference);
                    }
                  }
                }}
              />
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
