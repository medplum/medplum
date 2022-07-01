import React from 'react';
import './CheckboxFormSection.css';

export interface CheckboxFormSectionProps {
  htmlFor?: string;
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

export function CheckboxFormSection(props: CheckboxFormSectionProps): JSX.Element {
  return (
    <div className="medplum-checkbox-form-section">
      <div className="medplum-checkbox-form-section-checkbox-container">{props.children}</div>
      <div className="medplum-checkbox-form-section-details-container">
        <label htmlFor={props.htmlFor}>{props.title}</label>
        <p>{props.description}</p>
      </div>
    </div>
  );
}
