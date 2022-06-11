import { OperationOutcome } from '@medplum/fhirtypes';
import React, { RefObject } from 'react';
import { getIssuesForExpression } from './utils/outcomes';
import './Input.css';

export interface InputProps {
  name?: string;
  type?: string;
  size?: number;
  step?: number | 'any';
  defaultValue?: string | number;
  required?: boolean;
  autoCapitalize?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  outcome?: OperationOutcome;
  placeholder?: string;
  testid?: string;
  disabled?: boolean;
  onChange?: (newValue: string) => void;
}

export function Input(props: InputProps): JSX.Element {
  const className = 'medplum-input'; // + (props.size ? ' ' + props.size : '');
  const issues = getIssuesForExpression(props.outcome, props.name);
  const invalid = issues && issues.length > 0;
  return (
    <input
      id={props.name}
      name={props.name}
      type={getInputType(props.type)}
      size={props.size}
      step={props.step}
      className={className}
      defaultValue={props.defaultValue || ''}
      required={props.required}
      autoCapitalize={props.autoCapitalize}
      autoComplete={props.autoComplete}
      autoFocus={props.autoFocus}
      ref={props.inputRef}
      aria-invalid={invalid}
      aria-describedby={invalid ? props.name + '-errors' : ''}
      placeholder={props.placeholder}
      data-testid={props.testid}
      disabled={props.disabled}
      onChange={(e) => {
        if (props.onChange) {
          props.onChange(e.currentTarget.value);
        }
      }}
    />
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
  return navigator.userAgent.includes('jsdom') ? result.replace(/datetime-local|date/, 'text') : result;
}
