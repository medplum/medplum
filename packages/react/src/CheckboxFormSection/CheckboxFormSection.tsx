// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Input } from '@mantine/core';
import { JSX, ReactNode, useContext } from 'react';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import classes from '../FormSection/FormSection.module.css';
import { READ_ONLY_TOOLTIP_TEXT, maybeWrapWithTooltip } from '../utils/maybeWrapWithTooltip';

export interface CheckboxFormSectionProps {
  readonly htmlFor?: string;
  readonly title?: string;
  readonly description?: string;
  readonly withAsterisk?: boolean;
  readonly children?: ReactNode;
  readonly testId?: string;
  readonly fhirPath?: string;
  readonly readonly?: boolean;
}

export function CheckboxFormSection(props: CheckboxFormSectionProps): JSX.Element {
  const { debugMode } = useContext(ElementsContext);

  let label: ReactNode;
  if (debugMode && props.fhirPath) {
    label = `${props.title} - ${props.fhirPath}`;
  } else {
    label = props.title;
  }
  return maybeWrapWithTooltip(
    props?.readonly ? READ_ONLY_TOOLTIP_TEXT : undefined,
    <Group wrap="nowrap" data-testid={props.testId}>
      <div>{props.children}</div>
      <div>
        <Input.Wrapper
          id={props.htmlFor}
          label={label}
          classNames={{ label: props?.readonly ? classes.dimmed : undefined }}
          description={props.description}
          withAsterisk={props.withAsterisk}
        >
          {(() => null)()}
        </Input.Wrapper>
      </div>
    </Group>
  );
}
