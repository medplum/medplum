import { CSSProperties, ReactNode, SyntheticEvent } from 'react';
import { parseForm } from './FormUtils';

export interface FormProps {
  readonly onSubmit?: (formData: Record<string, string>) => void;
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
  readonly testid?: string;
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
