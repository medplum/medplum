import { OperationOutcome } from '@medplum/fhirtypes';
import React from 'react';
import { getIssuesForExpression } from './utils/outcomes';
import './FormSection.css';

export interface FormSectionProps {
  title?: string;
  htmlFor?: string;
  description?: string;
  outcome?: OperationOutcome;
  children?: React.ReactNode;
}

export function FormSection(props: FormSectionProps): JSX.Element {
  const issues = getIssuesForExpression(props.outcome, props.htmlFor);
  const invalid = issues && issues.length > 0;
  return (
    <fieldset>
      {props.title && <label htmlFor={props.htmlFor}>{props.title}</label>}
      {props.description && <small>{props.description}</small>}
      {props.children}
      {invalid && (
        <div id={props.htmlFor + '-errors'} className="medplum-input-error">
          {issues?.map((issue) => (
            <div data-testid="text-field-error" key={issue.details?.text}>
              {issue.details?.text}
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}
