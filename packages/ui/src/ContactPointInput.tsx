import { ContactPoint } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';

export interface ContactPointInputProps {
  name: string;
  defaultValue?: ContactPoint;
  onChange?: (value: ContactPoint) => void;
}

export function ContactPointInput(props: ContactPointInputProps) {
  const [contactPoint, setContactPoint] = useState(props.defaultValue);

  const ref = useRef<ContactPoint>();
  ref.current = contactPoint;

  function setContactPointWrapper(newValue: ContactPoint) {
    setContactPoint(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  function setSystem(system: string) {
    setContactPointWrapper({
      ...ref.current,
      system: system ? system : undefined,
    });
  }

  function setUse(use: string) {
    setContactPointWrapper({ ...ref.current, use: use ? use : undefined });
  }

  function setValue(value: string) {
    setContactPointWrapper({
      ...ref.current,
      value: value ? value : undefined,
    });
  }

  return (
    <table>
      <tbody>
        <tr>
          <td>
            <select
              defaultValue={contactPoint?.system}
              onChange={(e) => setSystem(e.currentTarget.value)}
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
            <select defaultValue={contactPoint?.use} onChange={(e) => setUse(e.currentTarget.value)} data-testid="use">
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
              onChange={(e) => setValue(e.currentTarget.value)}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
