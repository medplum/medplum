import { Button } from '@mantine/core';
import { Attachment, Reference } from '@medplum/fhirtypes';
import { MouseEvent, useState } from 'react';
import { AttachmentButton } from '../AttachmentButton/AttachmentButton';
import { AttachmentDisplay } from '../AttachmentDisplay/AttachmentDisplay';
import { killEvent } from '../utils/dom';

export interface AttachmentInputProps {
  readonly name: string;
  readonly defaultValue?: Attachment;
  readonly arrayElement?: boolean;
  readonly securityContext?: Reference;
  readonly onChange?: (value: Attachment | undefined) => void;
}

export function AttachmentInput(props: AttachmentInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);

  function setValueWrapper(newValue: Attachment | undefined): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  if (value) {
    return (
      <>
        <AttachmentDisplay value={value} maxWidth={200} />
        <Button
          onClick={(e: MouseEvent) => {
            killEvent(e);
            setValueWrapper(undefined);
          }}
        >
          Remove
        </Button>
      </>
    );
  }

  return (
    <AttachmentButton securityContext={props.securityContext} onUpload={setValueWrapper}>
      {(props) => <Button {...props}>Upload...</Button>}
    </AttachmentButton>
  );
}
