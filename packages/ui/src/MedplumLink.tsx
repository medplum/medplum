import React from 'react';
import { useMedplumRouter } from './MedplumProvider';
import { killEvent } from './utils/dom';

export interface MedplumLinkProps {
  to?: string;
  testid?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

export function MedplumLink(props: MedplumLinkProps) {
  const router = useMedplumRouter();
  return (
    <a
      href={props.to || '#'}
      data-testid={props.testid || 'link'}
      onClick={(e: React.SyntheticEvent) => {
        killEvent(e);
        if (props.to) {
          router.push(props.to);
        } else if (props.onClick) {
          props.onClick();
        }
        return false;
      }}
    >{props.children}</a>
  );
}
