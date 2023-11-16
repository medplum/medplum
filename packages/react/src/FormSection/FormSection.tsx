import { Input } from '@mantine/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { ReactNode } from 'react';
import { getErrorsForInput } from '../utils/outcomes';

export interface FormSectionProps {
  title?: string;
  htmlFor?: string;
  description?: React.ReactNode;
  withAsterisk?: boolean;
  outcome?: OperationOutcome;
  children?: ReactNode;
  fhirPath?: string;
}

export function FormSection(props: FormSectionProps): JSX.Element {
  let label: React.ReactNode;
  if (props.fhirPath) {
    label = `${props.title} - ${props.fhirPath}`;
  } else {
    label = props.title;
  }
  return (
    <Input.Wrapper
      id={props.htmlFor}
      label={label}
      description={props.description}
      withAsterisk={props.withAsterisk}
      error={getErrorsForInput(props.outcome, props.htmlFor)}
    >
      {props.children}
    </Input.Wrapper>
  );
}
