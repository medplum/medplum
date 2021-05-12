import { PropertyDefinition } from 'medplum';
import React, { useRef, useState } from 'react';
import { AttachmentInput } from './AttachmentInput';
import { useMedplum } from './MedplumProvider';

const generateKey = () => 'key' + Math.random();
const ensureKeys = (array: any[] | undefined) => (array || []).map(obj => ({ ...obj, __key: generateKey() }));

export interface AttachmentArrayProps {
  propertyPrefix?: string;
  property: PropertyDefinition;
  values?: any[];
  arrayElement?: boolean;
}

export function AttachmentArray(props: AttachmentArrayProps) {
  const medplum = useMedplum();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState(ensureKeys(props.values));

  function onFileChange(e: React.ChangeEvent) {
    e.preventDefault();
    e.stopPropagation();
    const files = (e.target as HTMLInputElement).files;
    if (!files) {
      return;
    }

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      processFile(file);
    }
  }

  /**
   * Processes a single file.
   *
   * @param {File} file The file descriptor.
   * @param {string=} optpath Optional string path.
   */
  function processFile(file: File, optpath?: string) {
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
        const copy = values.slice();
        copy.push({
          __key: generateKey(),
          contentType: obj.contentType,
          url: 'http://localhost:5000/fhir/R4/Binary/' + obj.id
        });
        setValues(copy);
      })
  }

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
              <AttachmentInput
                propertyPrefix={props.propertyPrefix}
                property={props.property}
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
  );
}
