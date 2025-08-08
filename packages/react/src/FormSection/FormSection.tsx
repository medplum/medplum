// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Input } from '@mantine/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import cx from 'clsx';
import { JSX, ReactNode, useContext } from 'react';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { READ_ONLY_TOOLTIP_TEXT, maybeWrapWithTooltip } from '../utils/maybeWrapWithTooltip';
import { getErrorsForInput } from '../utils/outcomes';
import classes from './FormSection.module.css';

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
  readonly readonly?: boolean;
}

export function FormSection(props: FormSectionProps): JSX.Element {
  const { debugMode } = useContext(ElementsContext);

  let label: ReactNode;
  if (debugMode && props.fhirPath) {
    label = `${props.title} - ${props.fhirPath}`;
  } else {
    label = props.title;
  }
  return maybeWrapWithTooltip(
    props?.readonly ? READ_ONLY_TOOLTIP_TEXT : undefined,
    <Input.Wrapper
      id={props.htmlFor}
      label={label}
      classNames={{
        label: cx({ [classes.dimmed]: props?.readonly }, classes.preserveBreaks),
      }}
      description={props.description}
      withAsterisk={props.withAsterisk}
      error={getErrorsForInput(props.outcome, props.errorExpression ?? props.htmlFor)}
      data-testid={props.testId}
    >
      {props.children}
    </Input.Wrapper>
  );
}
