import { Patient, Practitioner, RelatedPerson, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { formatHumanName } from './HumanNameUtils';
import { useMedplum } from './MedplumProvider';
import './Avatar.css';

type PhotoResource = Patient | Practitioner | RelatedPerson;

export interface AvatarProps {
  size?: 'small' | 'medium' | 'large';
  resource?: Patient | Practitioner | RelatedPerson;
  resourceType?: 'Patient' | 'Practitoner' | 'RelatedPerson';
  id?: string;
  src?: string;
  alt?: string;
  color?: string;
}

export const Avatar = (props: AvatarProps) => {
  const medplum = useMedplum();
  const [imageUrl, setImageUrl] = useState<string | undefined>(props.src);
  const [text, setText] = useState<string | undefined>(props.alt || '');

  function setResource(resource: PhotoResource) {
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

    if (props.resourceType && props.id) {
      medplum.readCached(props.resourceType, props.id)
        .then((resource: Resource) => setResource(resource as PhotoResource));
    }
  }, [props.resource, props.resourceType, props.id]);

  const className = props.size ? 'medplum-avatar ' + props.size : 'medplum-avatar';
  const initials = text && getInitials(text);
  return (
    <div className={className} style={{ backgroundColor: props.color }}>
      {imageUrl ? <img src={imageUrl} alt={props.alt} /> : initials}
    </div>
  );
};

function getImageSrc(resource: PhotoResource | undefined): string | undefined {
  const photos = resource?.photo;
  if (photos) {
    for (const photo of photos) {
      if (photo.url && photo.contentType && photo.contentType.startsWith('image/')) {
        return photo.url;
      }
    }
  }
}

function getText(resource: PhotoResource | undefined): string {
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
