import React from 'react';
import './Button.css';

export interface ButtonProps {
  type?: 'button' | 'submit';
  primary?: boolean;
  danger?: boolean;
  borderless?: boolean;
  size?: 'small' | 'medium' | 'large';
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  label?: string;
  testid?: string;
}

export function Button(props: ButtonProps): JSX.Element {
  const className =
    'medplum-button' +
    (props.primary || props.type === 'submit' ? ' medplum-button-primary' : '') +
    (props.danger ? ' medplum-button-danger' : '') +
    (props.borderless ? ' medplum-button-borderless' : '') +
    (props.size ? ' medplum-button-' + props.size : '');
  return (
    <button
      type={props.type || 'button'}
      className={className}
      onClick={props.onClick}
      aria-label={props.label}
      data-testid={props.testid}
    >
      {props.children}
    </button>
  );
}
