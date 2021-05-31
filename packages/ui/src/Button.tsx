import React from 'react';
import './Button.css';

export interface ButtonProps {
  type?: 'button' | 'submit';
  primary?: boolean;
  danger?: boolean;
  size?: 'small' | 'medium' | 'large';
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

export const Button = (props: ButtonProps) => {
  const className = 'btn' +
    ((props.primary || props.type === 'submit') ? ' btn-primary' : '') +
    (props.danger ? ' btn-danger' : '') +
    (props.size ? ' btn-' + props.size : '');
  return (
    <button
      type={props.type || 'button'}
      className={className}
      onClick={props.onClick}
    >{props.children}</button>
  );
};
