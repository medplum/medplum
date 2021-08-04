import React from 'react';
import './FormSection.css';

export interface FormSectionProps {
  title: string;
  htmlFor?: string;
  description?: string;
  children?: React.ReactNode;
}

export function FormSection(props: FormSectionProps) {
  return (
    <fieldset>
      <label htmlFor={props.htmlFor}>{props.title}</label>
      {props.description && <small>{props.description}</small>}
      {props.children}
    </fieldset>
  );
}
