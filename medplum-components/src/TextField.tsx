import React from 'react';
import './TextField.css';

export interface TextFieldProps {
  id?: string;
  type?: string;
  size?: 'small' | 'medium' | 'large';
  value?: string;
}

export const TextField = (props: TextFieldProps) => {
  const className = '';
  return (
    <input
      id={props.id}
      name={props.id}
      type={props.type || 'text'}
      className={className}
      defaultValue={props.value || ''}
    />
  );
};
