import { Input } from '@mantine/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { ReactNode, useContext } from 'react';
import { getErrorsForInput } from '../utils/outcomes';
import { BackboneElementContext } from '../BackboneElementInput/BackbonElementInput.utils';

export interface FormSectionProps {
  title?: string;
  htmlFor?: string;
  description?: React.ReactNode;
  withAsterisk?: boolean;
  outcome?: OperationOutcome;
  children?: ReactNode;
  testId?: string;
  fhirPath?: string;
}

export function FormSection(props: FormSectionProps): JSX.Element {
  const { debugMode } = useContext(BackboneElementContext);

  let label: React.ReactNode;
  if (debugMode && props.fhirPath) {
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
      data-testid={props.testId}
    >
      {props.children}
    </Input.Wrapper>
  );
}
