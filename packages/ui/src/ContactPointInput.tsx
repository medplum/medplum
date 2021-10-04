import { ContactPoint } from '@medplum/core';
import React, { useRef, useState } from 'react';

export interface ContactPointInputProps {
  name: string;
  defaultValue?: ContactPoint;
}

export function ContactPointInput(props: ContactPointInputProps) {
  const [contactPoint, setContactPoint] = useState(props.defaultValue);

  const ref = useRef<ContactPoint>();
  ref.current = contactPoint;

  function setSystem(system: string) {
    setContactPoint({ ...ref.current, system: system ? system : undefined });
  }

  function setUse(use: string) {
    setContactPoint({ ...ref.current, use: use ? use : undefined });
  }

  function setValue(value: string) {
    setContactPoint({ ...ref.current, value: value ? value : undefined });
  }

  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input
              name={props.name}
              type="hidden"
              value={JSON.stringify(contactPoint)}
              readOnly={true}
              data-testid="hidden"
            />
            <select
              defaultValue={contactPoint?.system}
              onChange={e => setSystem(e.currentTarget.value)}
              data-testid="system"
            >
              <option></option>
              <option>email</option>
              <option>fax</option>
              <option>pager</option>
              <option>phone</option>
              <option>other</option>
              <option>sms</option>
              <option>sms</option>
            </select>
          </td>
          <td>
            <select
              defaultValue={contactPoint?.use}
              onChange={e => setUse(e.currentTarget.value)}
              data-testid="use"
            >
              <option></option>
              <option>home</option>
              <option>mobile</option>
              <option>old</option>
              <option>temp</option>
              <option>work</option>
            </select>
          </td>
          <td>
            <input
              type="text"
              placeholder="Value"
              defaultValue={contactPoint?.value}
              onChange={e => setValue(e.currentTarget.value)} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
