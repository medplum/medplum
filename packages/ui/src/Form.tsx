import React, { CSSProperties } from 'react';
import { parseForm } from './FormUtils';

export interface FormProps {
  onSubmit?: (formData: Record<string, string>) => void;
  style?: CSSProperties;
  children?: React.ReactNode;
  testid?: string;
}

export function Form(props: FormProps): JSX.Element {
  return (
    <form
      style={props.style}
      data-testid={props.testid}
      onSubmit={(e: React.SyntheticEvent) => {
        e.preventDefault();
        const formData = parseForm(e.target as HTMLFormElement);
        if (props.onSubmit) {
          props.onSubmit(formData);
        }
      }}
    >
      {props.children}
    </form>
  );
}
