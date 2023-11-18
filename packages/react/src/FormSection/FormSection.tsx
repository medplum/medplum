import { Input } from '@mantine/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { ReactNode } from 'react';
import { getErrorsForInput } from '../utils/outcomes';

export interface FormSectionProps {
  title?: string;
  htmlFor?: string;
  description?: string;
  withAsterisk?: boolean;
  outcome?: OperationOutcome;
  children?: ReactNode;
}

export function FormSection(props: FormSectionProps): JSX.Element {
  return (
    <Input.Wrapper
      id={props.htmlFor}
      label={props.title}
      description={props.description}
      withAsterisk={props.withAsterisk}
      error={getErrorsForInput(props.outcome, props.htmlFor)}
    >
      {props.children}
    </Input.Wrapper>
  );
}
