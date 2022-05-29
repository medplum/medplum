import { OperationOutcome } from '@medplum/fhirtypes';
import React, { RefObject } from 'react';
import { getIssuesForExpression } from './utils/outcomes';
import './Select.css';

export interface SelectProps {
  name?: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLSelectElement>;
  children: React.ReactNode;
  outcome?: OperationOutcome;
  testid?: string;
  style?: React.CSSProperties;
  onChange?: (newValue: string) => void;
}

export function Select(props: SelectProps): JSX.Element {
  const className = 'medplum-select';
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
      style={props.style}
      aria-invalid={invalid}
      aria-describedby={invalid ? props.name + '-errors' : ''}
      data-testid={props.testid}
      onChange={(e) => {
        if (props.onChange) {
          props.onChange(e.currentTarget.value);
        }
      }}
    >
      {props.children}
    </select>
  );
}
