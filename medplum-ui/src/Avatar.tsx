import { Attachment, HumanName, Resource } from 'medplum';
import React, { useEffect, useState } from 'react';
import './Avatar.css';
import { formatHumanName } from './HumanNameUtils';
import { useMedplum } from './MedplumProvider';

export interface AvatarProps {
  size?: 'small' | 'medium' | 'large';
  resourceType?: 'Patient' | 'Practitoner' | 'RelatedPerson';
  id?: string;
  src?: string;
  alt?: string;
  color?: string;
}

interface PhotoResource {
  name?: HumanName[];
  photo?: Attachment[];
}

export const Avatar = (props: AvatarProps) => {
  const medplum = useMedplum();
  const [loading, setLoading] = useState(!props.src);
  const [imageUrl, setImageUrl] = useState<string | undefined>(props.src);
  const [text, setText] = useState<string | undefined>(props.alt);

  useEffect(() => {
    if (props.resourceType && props.id) {
      setLoading(true);
      console.log('readCached');
      medplum.readCached(props.resourceType, props.id)
        .then((resource: Resource) => {
          if (resource.resourceType !== 'Patient' && resource.resourceType !== 'Practitioner') {
            setLoading(false);
            return;
          }
          setText(getText(resource));
          const attachmentUrl = getImageSrc(resource);
          if (!attachmentUrl) {
            setLoading(false);
            return;
          }
          medplum.readCachedBlobAsImageUrl(attachmentUrl)
            .then(imageUrl => {
              setImageUrl(imageUrl);
              setLoading(false);
            });
        });
    }
  }, [props.resourceType, props.id]);

  if (loading) {
    return '...';
  }

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
