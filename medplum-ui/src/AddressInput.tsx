import { Address, PropertySchema } from 'medplum';
import React, { useState } from 'react';

function getLine(address: any, index: number) {
  return address && address.line && address.line.length > index ? address.line[index] : '';
}

export interface AddressInputProps {
  property: PropertySchema;
  name: string;
  value?: Address;
}

export function AddressInput(props: AddressInputProps) {
  const [value, setValue] = useState<Address>(props.value || {});
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <select defaultValue={value.use}>
              <option></option>
              <option>home</option>
              <option>mobile</option>
              <option>old</option>
              <option>temp</option>
              <option>work</option>
            </select>
          </td>
          <td>
            <select defaultValue={value.type}>
              <option></option>
              <option>postal</option>
              <option>physical</option>
              <option>both</option>
            </select>
          </td>
          <td>
            <input type="text" defaultValue={getLine(value, 0)} />
          </td>
          <td>
            <input type="text" defaultValue={getLine(value, 1)} />
          </td>
          <td>
            <input type="text" defaultValue={value.city} />
          </td>
          <td>
            <input type="text" defaultValue={value.state} />
          </td>
          <td>
            <input type="text" defaultValue={value.postalCode} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
