import { getDisplayString, getImageSrc, Reference, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';
import './Avatar.css';

export interface AvatarProps {
  size?: 'xsmall' | 'small' | 'medium' | 'large';
  value?: Reference | Resource;
  src?: string;
  alt?: string;
  color?: string;
  link?: boolean;
}

export const Avatar = (props: AvatarProps) => {
  const medplum = useMedplum();
  const [imageUrl, setImageUrl] = useState<string | undefined>(props.src);
  const [text, setText] = useState<string | undefined>(props.alt || '');
  const [linkUrl, setLinkUrl] = useState<string | undefined>();

  function setResource(resource: Resource) {
    setText(getDisplayString(resource));

    const attachmentUrl = getImageSrc(resource);
    if (attachmentUrl) {
      medplum.readCachedBlobAsObjectUrl(attachmentUrl).then(url => setImageUrl(url));
    }
  }

  useEffect(() => {
    const value = props.value as Reference | Resource | undefined;
    if (value) {
      if ('resourceType' in value) {
        const resource = value as Resource;
        setResource(resource);
        setLinkUrl(`/${resource.resourceType}/${resource.id}`);
      } else if ('reference' in value) {
        const reference = value as Reference;
        if (reference.reference === 'system') {
          setText('System');
        } else if (reference.reference) {
          setLinkUrl(`/${reference.reference}`)
          medplum.readCachedReference(reference).then(setResource);
        }
      }
    }
  }, [props.value]);

  const className = props.size ? 'medplum-avatar ' + props.size : 'medplum-avatar';
  const initials = text && getInitials(text);
  const innerContent = imageUrl ? <img src={imageUrl} alt={text} /> : initials;
  return (
    <div
      className={className}
      style={{ backgroundColor: props.color }}
      data-testid="avatar"
    >
      {props.link && linkUrl ? (
        <MedplumLink to={linkUrl}>
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
