import { OperationOutcome } from '@medplum/fhirtypes';
import React, { RefObject } from 'react';
import './TextArea.css';
import { getIssuesForExpression } from './utils/outcomes';

export interface TextAreaProps {
  name?: string;
  step?: number;
  defaultValue?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement>;
  // onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onChange?: (newValue: string) => void;
  outcome?: OperationOutcome;
  placeholder?: string;
  testid?: string;
  style?: React.CSSProperties;
}

export function TextArea(props: TextAreaProps): JSX.Element {
  const className = 'medplum-textarea';
  const issues = getIssuesForExpression(props.outcome, props.name);
  const invalid = issues && issues.length > 0;
  return (
    <textarea
      id={props.name}
      name={props.name}
      className={className}
      defaultValue={props.defaultValue || ''}
      required={props.required}
      autoComplete={props.autoComplete}
      autoFocus={props.autoFocus}
      ref={props.inputRef}
      aria-invalid={invalid}
      aria-describedby={invalid ? props.name + '-errors' : ''}
      placeholder={props.placeholder}
      data-testid={props.testid}
      style={props.style}
      onChange={(e) => {
        if (props.onChange) {
          props.onChange(e.currentTarget.value);
        }
      }}
    />
  );
}
