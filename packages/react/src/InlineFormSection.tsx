import { OperationOutcome } from '@medplum/fhirtypes';
import React from 'react';
import { killEvent } from './utils/dom';
import { getIssuesForExpression } from './utils/outcomes';
import './InlineFormSection.css';

export interface InlineFormSectionProps {
  title?: string;
  htmlFor?: string;
  description?: string;
  outcome?: OperationOutcome;
  display: React.ReactNode;
  input: React.ReactNode;
}

export function InlineFormSection(props: InlineFormSectionProps): JSX.Element {
  const [editing, setEditing] = React.useState(false);
  const issues = getIssuesForExpression(props.outcome, props.htmlFor);
  const invalid = issues && issues.length > 0;
  return (
    <fieldset className="medplum-form-section">
      <label className="medplum-inline-label" htmlFor={props.htmlFor}>
        {props.title}
        {!editing && (
          <InlineEditButton color="#888" onClick={() => setEditing(true)}>
            ✏️
          </InlineEditButton>
        )}
        {editing && (
          <InlineEditButton color="#1eca1e" onClick={() => setEditing(false)}>
            ✔️
          </InlineEditButton>
        )}
        {editing && (
          <InlineEditButton color="#cb2525" onClick={() => setEditing(false)}>
            ❌
          </InlineEditButton>
        )}
      </label>
      {props.description && <p>{props.description}</p>}
      {editing ? props.input : props.display}
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

interface InlineEditButtonProps {
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}

function InlineEditButton(props: InlineEditButtonProps): JSX.Element {
  return (
    <a
      className="medplum-inline-icon"
      style={{ textShadow: '0 0 0 ' + props.color }}
      href="#"
      onClick={(e: React.SyntheticEvent) => {
        killEvent(e);
        props.onClick();
      }}
    >
      {props.children}
    </a>
  );
}
