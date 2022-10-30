import { Anchor, TextProps } from '@mantine/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { killEvent } from '../utils/dom';

export interface MedplumLinkProps extends TextProps {
  to?: Resource | Reference | string;
  suffix?: string;
  label?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

export function MedplumLink(props: MedplumLinkProps): JSX.Element {
  const navigate = useNavigate();
  const { to, suffix, label, onClick, children, ...rest } = props;

  let href = getHref(to);
  if (suffix) {
    href += '/' + suffix;
  }

  return (
    <Anchor
      href={href}
      aria-label={label}
      onClick={(e: React.SyntheticEvent) => {
        killEvent(e);
        if (onClick) {
          onClick();
        } else if (to) {
          navigate(href);
        }
      }}
      {...rest}
    >
      {children}
    </Anchor>
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
