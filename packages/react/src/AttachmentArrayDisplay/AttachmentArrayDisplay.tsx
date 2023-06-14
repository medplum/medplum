import { Attachment } from '@medplum/fhirtypes';
import React from 'react';
import { AttachmentDisplay } from '../AttachmentDisplay/AttachmentDisplay';

export interface AttachmentArrayDisplayProps {
  values?: Attachment[];
  maxWidth?: number;
}

export function AttachmentArrayDisplay(props: AttachmentArrayDisplayProps): JSX.Element {
  return (
    <div>
      {props.values?.map((v, index) => (
        <div key={'attatchment-' + index}>
          <AttachmentDisplay value={v} maxWidth={props.maxWidth} />
        </div>
      ))}
    </div>
  );
}
