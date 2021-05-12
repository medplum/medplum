import { PropertyDefinition } from 'medplum';
import React from 'react';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

const generateKey = () => 'key' + Math.random();
const ensureKeys = (array: any[]) => (array || []).map(obj => ({ ...obj, __key: generateKey() }));

interface ResourceArrayDisplayProps {
  propertyPrefix: string;
  property: PropertyDefinition;
  values: any[];
  arrayElement?: boolean;
}

interface ResourceArrayDisplayState {
  values: any[];
}

export class ResourceArrayDisplay extends React.Component<ResourceArrayDisplayProps, ResourceArrayDisplayState> {

  constructor(props: ResourceArrayDisplayProps) {
    super(props);
    this.state = {
      values: ensureKeys(props.values)
    };
  }

  render() {
    const propertyPrefix = this.props.propertyPrefix;
    const property = this.props.property;
    const values = this.state.values;
    return values.map(v => (
      <ResourcePropertyDisplay
        key={v.__key}
        propertyPrefix={propertyPrefix}
        arrayElement={true}
        property={property}
        value={v} />
    ));
  }
}
