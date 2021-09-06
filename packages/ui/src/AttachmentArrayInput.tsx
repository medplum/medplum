import { Attachment } from '@medplum/core';
import React, { useState } from 'react';
import { AttachmentInput } from './AttachmentInput';
import { ensureKeys } from './FormUtils';
import { UploadButton } from './UploadButton';
import { killEvent } from './utils/dom';

export interface AttachmentArrayInputProps {
  name: string;
  defaultValue?: Attachment[];
  arrayElement?: boolean;
}

export function AttachmentArrayInput(props: AttachmentArrayInputProps) {
  const [values, setValues] = useState(ensureKeys(props.defaultValue));

  function addAttachment(attachment: Attachment) {
    const copy = values.slice();
    copy.push(attachment);
    setValues(ensureKeys(copy));
  }

  return (
    <div>
      {values.map((v: any) => v.__removed && (
        <input key={v.__key} type="hidden" name={props.name + '.' + v.__key} value={JSON.stringify(v)} />
      ))}
      <table>
        <colgroup>
          <col width="90%" />
          <col width="10%" />
        </colgroup>
        <tbody>
          {values.map((v: any, index: number) => !v.__removed && (
            <tr key={v.__key}>
              <td>
                <AttachmentInput
                  name={props.name + '.' + v.__key}
                  defaultValue={v} />
              </td>
              <td>
                <button
                  className="btn"
                  onClick={e => {
                    killEvent(e);
                    const copy = values.slice();
                    (copy[index] as any).__removed = true;
                    setValues(copy);
                  }}>Remove</button>
              </td>
            </tr>
          ))}
          <tr>
            <td></td>
            <td>
              <UploadButton onUpload={addAttachment} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
