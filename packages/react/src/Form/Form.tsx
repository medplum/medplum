import { CSSProperties, ReactNode, SyntheticEvent } from 'react';
import { parseForm } from './FormUtils';

export interface FormProps {
  onSubmit?: (formData: Record<string, string>) => void;
  style?: CSSProperties;
  children?: ReactNode;
  testid?: string;
}

export function Form(props: FormProps): JSX.Element {
  return (
    <form
      style={props.style}
      data-testid={props.testid}
      onSubmit={(e: SyntheticEvent) => {
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
