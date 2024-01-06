import { Group, Input } from '@mantine/core';
import { ReactNode, useContext } from 'react';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';

export interface CheckboxFormSectionProps {
  htmlFor?: string;
  title?: string;
  description?: string;
  withAsterisk?: boolean;
  children?: ReactNode;
  testId?: string;
  fhirPath?: string;
}

export function CheckboxFormSection(props: CheckboxFormSectionProps): JSX.Element {
  const { debugMode } = useContext(ElementsContext);

  let label: React.ReactNode;
  if (debugMode && props.fhirPath) {
    label = `${props.title} - ${props.fhirPath}`;
  } else {
    label = props.title;
  }
  return (
    <Group wrap="nowrap" data-testid={props.testId}>
      <div>{props.children}</div>
      <div>
        <Input.Wrapper
          id={props.htmlFor}
          label={label}
          description={props.description}
          withAsterisk={props.withAsterisk}
        >
          {(() => null)()}
        </Input.Wrapper>
      </div>
    </Group>
  );
}
