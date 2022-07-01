import { OperationOutcome } from '@medplum/fhirtypes';
import React, { RefObject } from 'react';
import { getIssuesForExpression } from './utils/outcomes';
import './TextArea.css';

export interface TextAreaProps {
  name?: string;
  defaultValue?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement>;
  outcome?: OperationOutcome;
  placeholder?: string;
  testid?: string;
  monospace?: boolean;
  style?: React.CSSProperties;
  onChange?: (newValue: string) => void;
}

export function TextArea(props: TextAreaProps): JSX.Element {
  const className = 'medplum-textarea' + (props.monospace ? ' monospace' : '');
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
