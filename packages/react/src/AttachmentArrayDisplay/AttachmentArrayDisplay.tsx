import { Attachment } from '@medplum/fhirtypes';
import { AttachmentDisplay } from '../AttachmentDisplay/AttachmentDisplay';
import { DescriptionListEntry } from '../DescriptionList/DescriptionList';
import { InternalSchemaElement, getPathDisplayName, isPopulated } from '@medplum/core';

export interface AttachmentArrayDisplayProps {
  readonly path?: string;
  readonly values?: Attachment[];
  readonly maxWidth?: number;
  readonly includeDescriptionListEntry?: boolean;
  readonly property?: InternalSchemaElement;
}

export function AttachmentArrayDisplay(props: AttachmentArrayDisplayProps): JSX.Element {
  const attachmentElements = props.values?.map((v, index) => (
    <div key={'attatchment-' + index}>
      <AttachmentDisplay value={v} maxWidth={props.maxWidth} />
    </div>
  ));

  let content: JSX.Element;
  if (props.includeDescriptionListEntry) {
    if (props.property === undefined) {
      throw new Error('props.property is required when includeDescriptionListEntry is true');
    }

    if (!isPopulated(props.path)) {
      throw new Error('props.path is required when includeDescriptionListEntry is true');
    }

    // Since arrays are responsible for rendering their own DescriptionListEntry, we must find the key
    const key = props.path.split('.').pop() as string;
    content = <DescriptionListEntry term={getPathDisplayName(key)}>{attachmentElements}</DescriptionListEntry>;
  } else {
    content = <>{attachmentElements}</>;
  }
  return content;
}
