import { Bundle, BundleEntry, createReference, ElementDefinition, Operator, Reference, Resource } from '@medplum/core';
import React, { useRef, useState } from 'react';
import { Autocomplete } from './Autocomplete';
import { Avatar } from './Avatar';
import { useMedplum } from './MedplumProvider';
import { ResourceName } from './ResourceName';

export interface ReferenceInputProps {
  property?: ElementDefinition;
  name: string;
  defaultValue?: Reference;
  onChange?: (value: Reference) => void;
}

export function ReferenceInput(props: ReferenceInputProps) {
  const targetTypes = getTargetTypes(props.property);
  const initialResourceType = getInitialResourceType(props.defaultValue, targetTypes);
  const medplum = useMedplum();
  const [value, setValue] = useState<Reference | undefined>(props.defaultValue);
  const [resourceType, setResourceType] = useState<string | undefined>(initialResourceType);

  const valueRef = useRef<Reference>();
  valueRef.current = value;

  const resourceTypeRef = useRef<string>();
  resourceTypeRef.current = resourceType;

  function setValueHelper(newValue: Reference): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

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
                    resourceType: resourceTypeRef.current as string,
                    filters: [{
                      code: 'name',
                      operator: Operator.EQUALS,
                      value: input
                    }]
                  })
                    .then((bundle: Bundle) => (bundle.entry as BundleEntry[]).map(entry => entry.resource as Resource));
                }}
                getId={(item: Reference | Resource) => {
                  if ('resourceType' in item) {
                    return item.id as string;
                  }
                  if ('reference' in item) {
                    return item.reference as string;
                  }
                  return item.toString();
                }}
                getIcon={(item: Reference | Resource) => <Avatar value={item} />}
                getDisplay={(item: Reference | Resource) => <ResourceName value={item} />}
                name={props.name + '-id'}
                defaultValue={props.defaultValue ? [props.defaultValue] : undefined}
                onChange={(items: (Reference | Resource)[]) => {
                  if (items.length > 0) {
                    if ('resourceType' in items[0]) {
                      setValueHelper(createReference(items[0]));
                    } else if ('reference' in items[0]) {
                      setValueHelper(items[0]);
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

function getTargetTypes(property?: ElementDefinition): string[] | undefined {
  return property?.type?.[0]?.targetProfile?.map(p => p.split('/').pop() as string);
}

function getInitialResourceType(defaultValue: Reference | undefined, targetTypes: string[] | undefined): string | undefined {
  const defaultValueResourceType = defaultValue?.reference?.split('/')[0]
  if (defaultValueResourceType) {
    return defaultValueResourceType;
  }

  if (targetTypes && targetTypes.length > 0) {
    return targetTypes[0];
  }

  return undefined;
}
