import { getDisplayString, getImageSrc, Reference, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';
import { useResource } from './useResource';
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
  const resource = useResource(props.value);
  const [imageUrl, setImageUrl] = useState<string | undefined>(props.src);

  useEffect(() => {
    if (resource) {
      const attachmentUrl = getImageSrc(resource);
      if (attachmentUrl) {
        medplum.readCachedBlobAsObjectUrl(attachmentUrl).then(url => setImageUrl(url));
      }
    }

  }, [resource]);

  const className = props.size ? 'medplum-avatar ' + props.size : 'medplum-avatar';
  const text = resource ? getDisplayString(resource) : props.alt ?? '';
  const initials = text && getInitials(text);
  const innerContent = imageUrl ? <img src={imageUrl} alt={text} /> : initials;
  return (
    <div
      className={className}
      style={{ backgroundColor: props.color }}
      data-testid="avatar"
    >
      {props.link && resource ? (
        <MedplumLink to={`/${resource.resourceType}/${resource.id}`}>
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
