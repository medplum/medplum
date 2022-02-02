import { OperationOutcome } from '@medplum/fhirtypes';
import React, { RefObject } from 'react';
import './Select.css';
import { getIssuesForExpression } from './utils/outcomes';

export interface SelectProps {
  name?: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLSelectElement>;
  // onChange?: (e: React.ChangeEvent) => void;
  // ref?: RefObject<HTMLSelectElement>;
  onChange?: (newValue: string) => void;
  children: React.ReactNode;
  outcome?: OperationOutcome;
  testid?: string;
  style?: React.CSSProperties;
}

export function Select(props: SelectProps): JSX.Element {
  // const className = props.size || '';
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
      // onChange={props.onChange}
      style={props.style}
      onChange={(e) => {
        if (props.onChange) {
          props.onChange(e.currentTarget.value);
        }
      }}
      aria-invalid={invalid}
      aria-describedby={invalid ? props.name + '-errors' : ''}
      data-testid={props.testid}
    >
      {props.children}
    </select>
  );
}
