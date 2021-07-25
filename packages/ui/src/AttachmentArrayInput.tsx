import { Attachment } from '@medplum/core';
import React, { useRef, useState } from 'react';
import { AttachmentInput } from './AttachmentInput';
import { ensureKeys, generateKey } from './FormUtils';
import { useMedplum } from './MedplumProvider';

export interface AttachmentArrayInputProps {
  name: string;
  values?: Attachment[];
  arrayElement?: boolean;
}

export function AttachmentArrayInput(props: AttachmentArrayInputProps) {
  const medplum = useMedplum();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState(ensureKeys(props.values));

  function onFileChange(e: React.ChangeEvent) {
    e.preventDefault();
    e.stopPropagation();
    const files = (e.target as HTMLInputElement).files;
    if (files) {
      Array.from(files).forEach(processFile);
    }
  }

  /**
   * Processes a single file.
   *
   * @param {File} file The file descriptor.
   */
  function processFile(file: File) {
    if (!file) {
      return;
    }

    const fileName = file.name;
    if (!fileName) {
      return;
    }

    const contentType = file.type || 'application/octet-stream';
    medplum.createBinary(file, contentType)
      .then((obj: any) => {
        const attachment = {
          __key: generateKey(),
          contentType: obj.contentType,
          url: medplum.fhirUrl('Binary', obj.id)
        };
        const copy = values.slice();
        copy.push(attachment);
        setValues(copy);
      })
      .catch((err: any) => {
        alert(err?.outcome?.issue?.[0]?.details?.text);
      });
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
                  value={v} />
              </td>
              <td>
                <button
                  className="btn"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
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
              <input
                type="file"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={e => onFileChange(e)} />
              <button
                className="btn"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}>Upload...</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
