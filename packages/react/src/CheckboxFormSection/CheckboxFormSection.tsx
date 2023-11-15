import { Group, Input } from '@mantine/core';
import { ReactNode } from 'react';

export interface CheckboxFormSectionProps {
  htmlFor?: string;
  title?: string;
  description?: string;
  withAsterisk?: boolean;
  children?: ReactNode;
  fhirPath?: string;
}

export function CheckboxFormSection(props: CheckboxFormSectionProps): JSX.Element {
  let label: React.ReactNode;
  if (props.fhirPath) {
    label = `${props.title} - ${props.fhirPath}`;
  } else {
    label = props.title;
  }
  return (
    <Group noWrap>
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
