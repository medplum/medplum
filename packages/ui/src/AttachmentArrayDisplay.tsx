import { Attachment } from '@medplum/core';
import React from 'react';
import { AttachmentDisplay } from './AttachmentDisplay';

export interface AttachmentArrayDisplayProps {
  values?: Attachment[];
}

export function AttachmentArrayDisplay(props: AttachmentArrayDisplayProps) {
  return (
    <div>
      {props.values && props.values.map((v, index) => (
        <div key={'attatchment-' + index}>
          <AttachmentDisplay value={v} />
        </div>
      ))}
    </div>
  );
}
