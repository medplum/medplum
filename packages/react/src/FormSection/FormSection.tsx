import { Input } from '@mantine/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { ReactNode, useContext } from 'react';
import { getErrorsForInput } from '../utils/outcomes';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';

export interface FormSectionProps {
  readonly title?: string;
  readonly htmlFor?: string;
  readonly description?: string;
  readonly withAsterisk?: boolean;
  readonly outcome?: OperationOutcome;
  readonly children?: ReactNode;
  readonly testId?: string;
  readonly fhirPath?: string;
  readonly errorExpression?: string;
}

export function FormSection(props: FormSectionProps): JSX.Element {
  const { debugMode } = useContext(ElementsContext);

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
      error={getErrorsForInput(props.outcome, props.errorExpression ?? props.htmlFor)}
      data-testid={props.testId}
    >
      {props.children}
    </Input.Wrapper>
  );
}
