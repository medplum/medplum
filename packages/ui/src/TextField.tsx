import { OperationOutcome } from '@medplum/core';
import React, { RefObject } from 'react';
import './TextField.css';

export interface TextFieldProps {
  id?: string;
  type?: string;
  size?: 'small' | 'medium' | 'large';
  value?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  onChange?: (e: React.ChangeEvent) => void;
  outcome?: OperationOutcome;
}

export const TextField = (props: TextFieldProps) => {
  const className = props.size || '';
  const issues = props.outcome?.issue?.filter(issue => issue.expression?.[0] === props.id);
  const invalid = issues && issues.length > 0;
  return (
    <>
      <input
        id={props.id}
        name={props.id}
        type={props.type || 'text'}
        className={className}
        defaultValue={props.value || ''}
        required={props.required}
        autoFocus={props.autoFocus}
        ref={props.inputRef}
        onChange={props.onChange}
        aria-invalid={invalid}
        aria-describedby={invalid ? props.id + '-errors' : ''}
      />
      {invalid && (
        <div id={props.id + '-errors'} className="medplum-input-error">
          {issues?.map(issue => (
            <div key={issue.details?.text}>{issue.details?.text}</div>
          ))}
        </div>
      )}
    </>
  );
};

export interface SelectProps {
  id?: string;
  size?: 'small' | 'medium' | 'large';
  value?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLSelectElement>;
  onChange?: (e: React.ChangeEvent) => void;
  children: React.ReactNode;
}

export const Select = (props: SelectProps) => {
  const className = props.size || '';
  return (
    <select
      id={props.id}
      name={props.id}
      className={className}
      defaultValue={props.value || ''}
      required={props.required}
      autoFocus={props.autoFocus}
      ref={props.inputRef}
      onChange={props.onChange}
    >{props.children}</select>
  );
};
