import { formatHumanName, ProfileResource, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { useMedplum } from './MedplumProvider';
import './Avatar.css';

export interface AvatarProps {
  size?: 'small' | 'medium' | 'large';
  resource?: ProfileResource;
  reference?: string;
  src?: string;
  alt?: string;
  color?: string;
}

export const Avatar = (props: AvatarProps) => {
  const medplum = useMedplum();
  const [imageUrl, setImageUrl] = useState<string | undefined>(props.src);
  const [text, setText] = useState<string | undefined>(props.alt || '');

  function setResource(resource: ProfileResource) {
    setText(getText(resource));

    const attachmentUrl = getImageSrc(resource);
    if (!attachmentUrl) {
      return;
    }

    medplum.readCachedBlobAsImageUrl(attachmentUrl)
      .then(imageUrl => setImageUrl(imageUrl));
  }

  useEffect(() => {
    if (props.resource) {
      setResource(props.resource);
      return;
    }

    if (props.reference) {
      medplum.readCachedReference(props.reference)
        .then((resource: Resource) => setResource(resource as ProfileResource));
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

function getImageSrc(resource: ProfileResource | undefined): string | undefined {
  const photos = resource?.photo;
  if (photos) {
    for (const photo of photos) {
      if (photo.url && photo.contentType && photo.contentType.startsWith('image/')) {
        return photo.url;
      }
    }
  }
}

function getText(resource: ProfileResource | undefined): string {
  const names = resource?.name;
  if (names) {
    for (const name of names) {
      return formatHumanName(name);
    }
  }
  return '';
}

function getInitials(text: string): string {
  return text.split(' ').map(n => n[0]).join('');
}
