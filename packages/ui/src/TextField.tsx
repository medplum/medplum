import { OperationOutcome } from '@medplum/core';
import React, { RefObject } from 'react';
import { getIssuesForExpression } from './utils/outcomes';
import './TextField.css';

export interface TextFieldProps {
  name?: string;
  type?: string;
  size?: 'small' | 'medium' | 'large';
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  onChange?: (e: React.ChangeEvent) => void;
  outcome?: OperationOutcome
  testid?: string;
}

export function TextField(props: TextFieldProps) {
  const className = props.size || '';
  const issues = getIssuesForExpression(props.outcome, props.name);
  const invalid = issues && issues.length > 0;
  return (
    <input
      id={props.name}
      name={props.name}
      type={props.type || 'text'}
      className={className}
      defaultValue={props.defaultValue || ''}
      required={props.required}
      autoFocus={props.autoFocus}
      ref={props.inputRef}
      onChange={props.onChange}
      aria-invalid={invalid}
      aria-describedby={invalid ? props.name + '-errors' : ''}
      data-testid={props.testid}
    />
  );
}

export interface SelectProps {
  name?: string;
  size?: 'small' | 'medium' | 'large';
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLSelectElement>;
  onChange?: (e: React.ChangeEvent) => void;
  children: React.ReactNode;
  outcome?: OperationOutcome
}

export function Select(props: SelectProps) {
  const className = props.size || '';
  const issues = getIssuesForExpression(props.outcome, props.name);
  const invalid = issues && issues.length > 0;
  return (
    <select
      id={props.name}
      name={props.name}
      className={className}
      defaultValue={props.defaultValue || ''}
      required={props.required}
      autoFocus={props.autoFocus}
      ref={props.inputRef}
      onChange={props.onChange}
      aria-invalid={invalid}
      aria-describedby={invalid ? props.name + '-errors' : ''}
    >{props.children}</select>
  );
}
