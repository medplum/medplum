import { getDisplayString, getImageSrc, Reference, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import './Avatar.css';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';

export interface AvatarProps {
  size?: 'xsmall' | 'small' | 'medium' | 'large';
  resource?: Resource;
  reference?: Reference;
  src?: string;
  alt?: string;
  color?: string;
  link?: boolean;
}

export const Avatar = (props: AvatarProps) => {
  const medplum = useMedplum();
  const [imageUrl, setImageUrl] = useState<string | undefined>(props.src);
  const [text, setText] = useState<string | undefined>(props.alt || '');

  function setResource(resource: Resource) {
    setText(getDisplayString(resource));

    const attachmentUrl = getImageSrc(resource);
    if (attachmentUrl) {
      medplum.readCachedBlobAsObjectUrl(attachmentUrl).then(url => setImageUrl(url));
    }
  }

  useEffect(() => {
    if (props.resource) {
      setResource(props.resource);
    } else if (props.reference) {
      medplum.readCachedReference(props.reference)
      .then(setResource)
      .catch(err => console.log('Avatar cached ref error', err, props.reference));
    }
  }, [props.resource, props.reference]);

  const className = props.size ? 'medplum-avatar ' + props.size : 'medplum-avatar';
  const initials = text && getInitials(text);
  const innerContent = imageUrl ? <img src={imageUrl} alt={text} /> : initials;
  return (
    <div
      className={className}
      style={{ backgroundColor: props.color }}
      data-testid="avatar"
    >
      {props.link ? (
        <MedplumLink to={`/${props.reference?.reference}`}>
          {innerContent}
        </MedplumLink>
      ) : (
        innerContent
      )}
    </div>
  );
};

function getInitials(text: string): string {
  return text.split(' ').map(n => n[0]).join('');
}
