import { OperationOutcome } from '@medplum/fhirtypes';
import React, { RefObject } from 'react';
import { getIssuesForExpression } from './utils/outcomes';
import './TextField.css';

export interface TextFieldProps {
  name?: string;
  type?: string;
  size?: 'small' | 'medium' | 'large';
  step?: number;
  defaultValue?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  outcome?: OperationOutcome;
  placeholder?: string;
  testid?: string;
}

export function TextField(props: TextFieldProps): JSX.Element {
  const className = props.size || '';
  const issues = getIssuesForExpression(props.outcome, props.name);
  const invalid = issues && issues.length > 0;
  return (
    <input
      id={props.name}
      name={props.name}
      type={getInputType(props.type)}
      step={props.step}
      className={className}
      defaultValue={props.defaultValue || ''}
      required={props.required}
      autoComplete={props.autoComplete}
      autoFocus={props.autoFocus}
      ref={props.inputRef}
      onChange={props.onChange}
      aria-invalid={invalid}
      aria-describedby={invalid ? props.name + '-errors' : ''}
      placeholder={props.placeholder}
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
  outcome?: OperationOutcome;
}

export function Select(props: SelectProps): JSX.Element {
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
    >
      {props.children}
    </select>
  );
}

/**
 * Returns the input type for the requested type.
 * JSDOM does not support many of the valid <input> type attributes.
 * For example, it won't fire change events for <input type="datetime-local">.
 * @param requestedType The optional type as requested by the parent component.
 */
function getInputType(requestedType: string | undefined): string {
  const result = requestedType || 'text';
  return process.env.NODE_ENV === 'test' ? result.replace(/date|datetime-local/, 'text') : result;
}
