import React from 'react';
import './FormSection.css';

export interface FormSectionProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function FormSection(props: FormSectionProps) {
  return (
    <fieldset>
      <legend>{props.title}</legend>
      {props.description && <small>{props.description}</small>}
      {props.children}
    </fieldset>
  );
}
