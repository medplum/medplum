import { ActionIcon } from '@mantine/core';
import { Attachment } from '@medplum/fhirtypes';
import { IconCircleMinus, IconCloudUpload } from '@tabler/icons-react';
import { MouseEvent, useRef, useState } from 'react';
import { AttachmentButton } from '../AttachmentButton/AttachmentButton';
import { AttachmentDisplay } from '../AttachmentDisplay/AttachmentDisplay';
import { killEvent } from '../utils/dom';

export interface AttachmentArrayInputProps {
  readonly name: string;
  readonly defaultValue?: Attachment[];
  readonly arrayElement?: boolean;
  readonly onChange?: (value: Attachment[]) => void;
  readonly disabled?: boolean;
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
        <col width="97%" />
        <col width="3%" />
      </colgroup>
      <tbody>
        {values.map((v: Attachment, index: number) => (
          <tr key={`${index}-${values.length}`}>
            <td>
              <AttachmentDisplay value={v} maxWidth={200} />
            </td>
            <td>
              <ActionIcon
                disabled={props.disabled}
                title="Remove"
                variant="subtle"
                size="sm"
                color="gray"
                onClick={(e: MouseEvent) => {
                  killEvent(e);
                  const copy = values.slice();
                  copy.splice(index, 1);
                  setValuesWrapper(copy);
                }}
              >
                <IconCircleMinus />
              </ActionIcon>
            </td>
          </tr>
        ))}
        <tr>
          <td></td>
          <td>
            <AttachmentButton
              disabled={props.disabled}
              onUpload={(attachment: Attachment) => {
                setValuesWrapper([...(valuesRef.current as Attachment[]), attachment]);
              }}
            >
              {(props) => (
                <ActionIcon {...props} title="Add" variant="subtle" size="sm" color={props.disabled ? 'gray' : 'green'}>
                  <IconCloudUpload />
                </ActionIcon>
              )}
            </AttachmentButton>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
