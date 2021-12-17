import { Attachment } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { AttachmentDisplay } from './AttachmentDisplay';
import { Button } from './Button';
import { UploadButton } from './UploadButton';
import { killEvent } from './utils/dom';

export interface AttachmentInputProps {
  name: string;
  defaultValue?: Attachment;
  arrayElement?: boolean;
  onChange?: (value: Attachment | undefined) => void;
}

export function AttachmentInput(props: AttachmentInputProps) {
  const [value, setValue] = useState(props.defaultValue);

  function setValueWrapper(newValue: Attachment | undefined) {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  if (value) {
    return (
      <>
        <AttachmentDisplay value={value} maxWidth={200} />
        <Button onClick={e => {
          killEvent(e);
          setValueWrapper(undefined);
        }}>Remove</Button>
      </>
    );
  }

  return (
    <UploadButton onUpload={setValueWrapper} />
  );
}
