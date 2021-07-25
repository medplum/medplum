import { getDisplayString, getImageSrc, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { useMedplum } from './MedplumProvider';
import './Avatar.css';

export interface AvatarProps {
  size?: 'small' | 'medium' | 'large';
  resource?: Resource;
  reference?: string;
  src?: string;
  alt?: string;
  color?: string;
}

export const Avatar = (props: AvatarProps) => {
  const medplum = useMedplum();
  const [imageUrl, setImageUrl] = useState<string | undefined>(props.src);
  const [text, setText] = useState<string | undefined>(props.alt || '');

  function setResource(resource: Resource) {
    setText(getDisplayString(resource));

    const attachmentUrl = getImageSrc(resource);
    if (!attachmentUrl) {
      return;
    }

    medplum.readCachedBlobAsImageUrl(attachmentUrl)
      .then(url => setImageUrl(url));
  }

  useEffect(() => {
    if (props.resource) {
      setResource(props.resource);
      return;
    }

    if (props.reference) {
      medplum.readCachedReference(props.reference)
        .then((resource: Resource) => setResource(resource));
    }
  }, [props.resource, props.reference]);

  const className = props.size ? 'medplum-avatar ' + props.size : 'medplum-avatar';
  const initials = text && getInitials(text);
  return (
    <div className={className} style={{ backgroundColor: props.color }}>
      {imageUrl ? <img src={imageUrl} alt={props.alt} /> : initials}
    </div>
  );
};

function getInitials(text: string): string {
  return text.split(' ').map(n => n[0]).join('');
}
