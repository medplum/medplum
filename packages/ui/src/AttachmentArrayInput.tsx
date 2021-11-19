import { Attachment } from '@medplum/core';
import React, { useRef, useState } from 'react';
import { AttachmentInput } from './AttachmentInput';
import { UploadButton } from './UploadButton';
import { killEvent } from './utils/dom';

export interface AttachmentArrayInputProps {
  name: string;
  defaultValue?: Attachment[];
  arrayElement?: boolean;
  onChange?: (value: Attachment[]) => void;
}

export function AttachmentArrayInput(props: AttachmentArrayInputProps) {
  const [values, setValues] = useState(props.defaultValue ?? []);

  const valuesRef = useRef<Attachment[]>();
  valuesRef.current = values;

  function setValuesWrapper(newValues: Attachment[]) {
    setValues(newValues);
    if (props.onChange) {
      props.onChange(newValues);
    }
  }

  return (
    <div>
      <table>
        <colgroup>
          <col width="90%" />
          <col width="10%" />
        </colgroup>
        <tbody>
          {values.map((v: any, index: number) => !v.__removed && (
            <tr key={`${index}-${values.length}`}>
              <td>
                <AttachmentInput
                  name={props.name}
                  defaultValue={v} />
              </td>
              <td>
                <button
                  className="btn"
                  onClick={e => {
                    killEvent(e);
                    const copy = values.slice();
                    copy.splice(index, 1);
                    setValuesWrapper(copy);
                  }}>Remove</button>
              </td>
            </tr>
          ))}
          <tr>
            <td></td>
            <td>
              <UploadButton onUpload={(attachment: Attachment) => {
                setValuesWrapper([...(valuesRef.current as Attachment[]), attachment]);
              }} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
