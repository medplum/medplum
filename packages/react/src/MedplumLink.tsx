import { Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { killEvent } from './utils/dom';

export interface MedplumLinkProps {
  to?: Resource | Reference | string;
  suffix?: string;
  label?: string;
  id?: string;
  testid?: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

export function MedplumLink(props: MedplumLinkProps): JSX.Element {
  const navigate = useNavigate();

  let href = getHref(props.to);
  if (props.suffix) {
    href += '/' + props.suffix;
  }

  return (
    <a
      href={href}
      id={props.id}
      aria-label={props.label}
      data-testid={props.testid || 'link'}
      className={props.className}
      onClick={(e: React.SyntheticEvent) => {
        killEvent(e);
        if (props.onClick) {
          props.onClick();
        } else if (props.to) {
          navigate(href);
        }
      }}
    >
      {props.children}
    </a>
  );
}

function getHref(to: Resource | Reference | string | undefined): string {
  if (to) {
    if (typeof to === 'string') {
      return getStringHref(to);
    } else if ('resourceType' in to) {
      return getResourceHref(to);
    } else if ('reference' in to) {
      return getReferenceHref(to);
    }
  }
  return '#';
}

function getStringHref(to: string): string {
  if (to.startsWith('http://') || to.startsWith('https://') || to.startsWith('/')) {
    return to;
  }
  return '/' + to;
}

function getResourceHref(to: Resource): string {
  return `/${to.resourceType}/${to.id}`;
}

function getReferenceHref(to: Reference): string {
  return `/${to.reference}`;
}
