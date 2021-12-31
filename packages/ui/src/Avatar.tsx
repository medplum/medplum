import { getDisplayString, getImageSrc } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { MedplumLink } from './MedplumLink';
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

export function Avatar(props: AvatarProps): JSX.Element {
  const resource = useResource(props.value);
  const className = props.size ? 'medplum-avatar ' + props.size : 'medplum-avatar';
  const text = resource ? getDisplayString(resource) : props.alt ?? '';
  const initials = text && getInitials(text);
  const imageUrl = (resource && getImageSrc(resource)) ?? props.src;
  const innerContent = imageUrl ? <img src={imageUrl} alt={text} /> : initials;
  return (
    <div className={className} style={{ backgroundColor: props.color }} data-testid="avatar">
      {props.link && resource ? <MedplumLink to={resource}>{innerContent}</MedplumLink> : innerContent}
    </div>
  );
}

function getInitials(text: string): string {
  return text
    .split(' ')
    .map((n) => n[0])
    .join('');
}
