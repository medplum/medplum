import { ActionIcon, Button } from '@mantine/core';
import { Attachment } from '@medplum/fhirtypes';
import { IconCloudUpload } from '@tabler/icons';
import React, { useRef, useState } from 'react';
import { AttachmentButton } from './AttachmentButton';
import { AttachmentDisplay } from './AttachmentDisplay';
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
                onClick={(e: React.MouseEvent) => {
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
            <AttachmentButton
              onUpload={(attachment: Attachment) => {
                setValuesWrapper([...(valuesRef.current as Attachment[]), attachment]);
              }}
            >
              {(props) => (
                <ActionIcon {...props} variant="filled">
                  <IconCloudUpload size={16} />
                </ActionIcon>
              )}
            </AttachmentButton>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
