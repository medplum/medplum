import React from 'react';
import { PropertyDefinition } from 'medplum';
import { FormSection } from './FormSection';
import { ResourceField } from './ResourceField';

const generateKey = () => 'key' + Math.random();
const ensureKeys = (array: any[]) => (array || []).map(obj => ({ ...obj, __key: generateKey() }));

interface ResourceArrayProps {
  propertyPrefix: string;
  property: PropertyDefinition;
  values: any[];
  arrayElement?: boolean;
}

interface ResourceArrayState {
  values: any[];
}

export class ResourceArray extends React.Component<ResourceArrayProps, ResourceArrayState> {

  constructor(props: ResourceArrayProps) {
    super(props);
    this.state = {
      values: ensureKeys(props.values)
    };
  }

  render() {
    const propertyPrefix = this.props.propertyPrefix;
    const property = this.props.property;
    const values = this.state.values;
    return (
      <table>
        <colgroup>
          <col width="90%" />
          <col width="10%" />
        </colgroup>
        <tbody>
          {values.map((v, index) => (
            <tr key={v.__key}>
              <td>
                <ResourceField
                  propertyPrefix={propertyPrefix}
                  arrayElement={true}
                  property={property}
                  value={v} />
              </td>
              <td>
                <button
                  className="btn"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const copy = values.slice();
                    copy.splice(index, 1);
                    this.setState({ values: copy });
                  }}>Remove</button>
              </td>
            </tr>
          ))}
          <tr>
            <td></td>
            <td>
              <button
                className="btn"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  const copy = values.slice();
                  copy.push({ __key: generateKey() });
                  this.setState({ values: copy });
                }}>Add</button>
            </td>
          </tr>
        </tbody>
      </table>
    );
  }
}
