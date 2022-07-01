import { Attachment } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { AttachmentDisplay } from './AttachmentDisplay';
import { Button } from './Button';
import { UploadButton } from './UploadButton';
import { killEvent } from './utils/dom';

export interface AttachmentArrayInputProps {
  name: string;
  defaultValue?: Attachment[];
  arrayElement?: boolean;
  onChange?: (value: Attachment[]) => void;
}

export function AttachmentArrayInput(props: AttachmentArrayInputProps): JSX.Element {
  const [values, setValues] = useState<Attachment[]>(props.defaultValue ?? []);

  const valuesRef = useRef<Attachment[]>();
  valuesRef.current = values;

  function setValuesWrapper(newValues: Attachment[]): void {
    setValues(newValues);
    if (props.onChange) {
      props.onChange(newValues);
    }
  }

  return (
    <table style={{ width: '100%' }}>
      <colgroup>
        <col width="90%" />
        <col width="10%" />
      </colgroup>
      <tbody>
        {values.map((v: Attachment, index: number) => (
          <tr key={`${index}-${values.length}`}>
            <td>
              <AttachmentDisplay value={v} maxWidth={200} />
            </td>
            <td className="medplum-right">
              <Button
                onClick={(e) => {
                  killEvent(e);
                  const copy = values.slice();
                  copy.splice(index, 1);
                  setValuesWrapper(copy);
                }}
              >
                Remove
              </Button>
            </td>
          </tr>
        ))}
        <tr>
          <td></td>
          <td className="medplum-right">
            <UploadButton
              onUpload={(attachment: Attachment) => {
                setValuesWrapper([...(valuesRef.current as Attachment[]), attachment]);
              }}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
