import { Group, Input } from '@mantine/core';
import React from 'react';

export interface CheckboxFormSectionProps {
  htmlFor?: string;
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

export function CheckboxFormSection(props: CheckboxFormSectionProps): JSX.Element {
  return (
    <Group noWrap>
      <div>{props.children}</div>
      <div>
        <Input.Wrapper id={props.htmlFor} label={props.title} description={props.description}>
          {(() => null)()}
        </Input.Wrapper>
      </div>
    </Group>
  );
}
