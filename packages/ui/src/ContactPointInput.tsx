import { ContactPoint } from '@medplum/core';
import React, { useRef, useState } from 'react';

export interface ContactPointInputProps {
  name: string;
  value?: ContactPoint;
}

export function ContactPointInput(props: ContactPointInputProps) {
  const [contactPoint, setContactPoint] = useState(props.value);

  const ref = useRef<ContactPoint>();
  ref.current = contactPoint;

  function setSystem(system: string) {
    setContactPoint({ ...ref.current, system });
  }

  function setUse(use: string) {
    setContactPoint({ ...ref.current, use });
  }

  function setValue(value: string) {
    setContactPoint({ ...ref.current, value });
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
              readOnly={true} />
            <select
              defaultValue={contactPoint?.system}
              onChange={e => setSystem(e.currentTarget.value)}>
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
              onChange={e => setUse(e.currentTarget.value)}>
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
              defaultValue={contactPoint?.value}
              onChange={e => setValue(e.currentTarget.value)} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
