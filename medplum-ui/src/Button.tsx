import React from 'react';
import './Button.css';

export interface ButtonProps {
  primary?: boolean;
  danger?: boolean;
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  children: React.ReactNode;
}

export const Button = (props: ButtonProps) => {
  const className = 'btn' +
    (props.primary ? ' btn-primary' : '') +
    (props.danger ? ' btn-danger' : '') +
    (props.size ? ' btn-' + props.size : '');
  return (
    <button
      type="button"
      className={className}
    >
      {props.children}
    </button>
  );
};
